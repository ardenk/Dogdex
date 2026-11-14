import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_PHOTOS_PER_DOG } from '../domain/types'
import { awardNewBadges } from '../storage/awardBadges'
import { createDb } from '../storage/db'
import { createLocalRepo } from '../storage/localRepo'

let n = 0
let repo: ReturnType<typeof createLocalRepo>
beforeEach(() => {
  repo = createLocalRepo(createDb(`test-${n++}`))
})

const photo = { blob: new Blob(['x']), thumb: new Blob(['y']), width: 10, height: 10 }

describe('local repository', () => {
  it('logs a dog with only a breed (photo-free, 1 call)', async () => {
    const r = await repo.logSighting({ breedId: 'beagle', metAt: 1000 })
    expect(r.isNewBreed).toBe(true)
    const snap = await repo.getSnapshot()
    expect(snap.dogs).toHaveLength(1)
    expect(snap.encounters).toHaveLength(1)
    expect(snap.guesses).toHaveLength(0)
  })
  it('flags new breeds only the first time', async () => {
    await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const again = await repo.logSighting({ breedId: 'beagle', metAt: 2 })
    expect(again.isNewBreed).toBe(false)
  })
  it('supports custom breeds and requires some breed', async () => {
    await repo.logSighting({ breedId: null, customBreedLabel: ' Pug ', metAt: 1 })
    expect((await repo.getSnapshot()).dogs[0].customBreedLabel).toBe('Pug')
    await expect(repo.logSighting({ breedId: null, metAt: 1 })).rejects.toThrow()
  })
  it('records the guess and whether it was right', async () => {
    await repo.logSighting({ breedId: 'beagle', metAt: 1, photo, guess: { guessedBreedId: 'beagle', suggestions: [], identifierId: 'mock-v1' } })
    await repo.logSighting({ breedId: 'beagle', metAt: 2, photo, guess: { guessedBreedId: 'dachshund', suggestions: [], identifierId: 'mock-v1' } })
    await repo.logSighting({ breedId: 'beagle', metAt: 3, photo, guess: { guessedBreedId: null, suggestions: [], identifierId: 'mock-v1' } })
    const { guesses } = await repo.getSnapshot()
    expect(guesses.map((g) => g.correct).sort()).toEqual([false, null, true].sort())
  })
  it('"Met again" adds an encounter without creating a dog', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1000 })
    await repo.addEncounter(dog.id, { metAt: 5000, placeLabel: 'Tribeca' })
    const snap = await repo.getSnapshot()
    expect(snap.dogs).toHaveLength(1)
    expect(snap.encounters).toHaveLength(2)
    expect(snap.dogs[0].lastMetAt).toBe(5000)
    expect(snap.dogs[0].firstMetAt).toBe(1000)
  })
  it('soft-deletes a dog and hides its records', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    await repo.deleteDog(dog.id)
    const snap = await repo.getSnapshot()
    expect(snap.dogs).toHaveLength(0)
    expect(snap.encounters).toHaveLength(0)
  })
  it('awards each badge only once', async () => {
    await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    expect((await awardNewBadges(repo)).map((b) => b.id)).toEqual(['first-dog'])
    expect(await awardNewBadges(repo)).toEqual([])
  })
  it('stores settings with defaults', async () => {
    expect((await repo.getSettings()).weeklyGoal).toBe(5)
    await repo.setSetting('weeklyGoal', 7)
    expect((await repo.getSettings()).weeklyGoal).toBe(7)
  })
  it('never stores raw coordinates, only the rounded cell', async () => {
    await repo.logSighting({ breedId: 'beagle', metAt: 1, placeLabel: 'Tribeca', geoCell: '40.72,-74.01' })
    const e = (await repo.getSnapshot()).encounters[0]
    expect(Object.keys(e)).not.toEqual(expect.arrayContaining(['lat', 'lng', 'latitude', 'longitude']))
    expect(e.geoCell).toBe('40.72,-74.01')
  })
})

describe('custom breeds', () => {
  it('renames a custom breed and files it under a group for every dog', async () => {
    await repo.logSighting({ breedId: null, customBreedLabel: 'Staffordshire Terrier', metAt: 1 })
    await repo.logSighting({ breedId: null, customBreedLabel: 'Staffordshire Terrier', metAt: 2 })
    await repo.logSighting({ breedId: null, customBreedLabel: 'Pug', metAt: 3 })
    const changed = await repo.updateCustomBreed('Staffordshire Terrier', { label: ' Staffordshire Bull Terrier ', groupId: 'terrier' })
    expect(changed).toBe(2)
    const dogs = (await repo.getSnapshot()).dogs
    expect(dogs.filter((d) => d.customBreedLabel === 'Staffordshire Bull Terrier' && d.customGroupId === 'terrier')).toHaveLength(2)
    expect(dogs.find((d) => d.customBreedLabel === 'Pug')?.customGroupId).toBeUndefined()
  })
  it('can clear the category and rejects an empty name', async () => {
    await repo.logSighting({ breedId: null, customBreedLabel: 'Pug', metAt: 1 })
    await repo.updateCustomBreed('Pug', { label: 'Pug', groupId: 'toy' })
    await repo.updateCustomBreed('Pug', { label: 'Pug' })
    expect((await repo.getSnapshot()).dogs[0].customGroupId).toBeUndefined()
    await expect(repo.updateCustomBreed('Pug', { label: '  ' })).rejects.toThrow()
  })
})

describe('choosing a category when adding a breed, and changing a dog\'s breed', () => {
  it('files a new custom breed under the chosen category', async () => {
    await repo.logSighting({ breedId: null, customBreedLabel: 'Staffordshire Bull Terrier', customGroupId: 'terrier', metAt: 1 })
    expect((await repo.getSnapshot()).dogs[0]).toMatchObject({ customBreedLabel: 'Staffordshire Bull Terrier', customGroupId: 'terrier' })
  })
  it('ignores a category for a listed breed (it already has one)', async () => {
    await repo.logSighting({ breedId: 'beagle', customGroupId: 'toy', metAt: 1 })
    expect((await repo.getSnapshot()).dogs[0].customGroupId).toBeUndefined()
  })
  it('changes a dog from a custom breed to a listed one, and back', async () => {
    const { dog } = await repo.logSighting({ breedId: null, customBreedLabel: 'Staffy', customGroupId: 'terrier', metAt: 1 })
    await repo.updateDogBreed(dog.id, { breedId: 'beagle' })
    const asListed = (await repo.getSnapshot()).dogs[0]
    expect(asListed.breedId).toBe('beagle')
    expect(asListed.customBreedLabel).toBeUndefined()
    expect(asListed.customGroupId).toBeUndefined()
    await repo.updateDogBreed(dog.id, { breedId: null, customBreedLabel: ' Pug ', customGroupId: 'toy' })
    expect((await repo.getSnapshot()).dogs[0]).toMatchObject({ breedId: null, customBreedLabel: 'Pug', customGroupId: 'toy' })
    await expect(repo.updateDogBreed(dog.id, { breedId: null })).rejects.toThrow()
  })
})

describe('several photos per dog', () => {
  const pic = (n: string) => ({ blob: new Blob([n]), thumb: new Blob([n]), width: 10, height: 8 })
  const liveIds = async (dogId: string) => (await repoDb().photos.where('dogId').equals(dogId).toArray()).filter((p) => !p.deletedAt).map((p) => p.id)
  let dbRef: ReturnType<typeof createDb>
  const repoDb = () => dbRef

  beforeEach(() => {
    dbRef = createDb(`photos-${n++}`)
    repo = createLocalRepo(dbRef)
  })

  it('makes the first photo the cover and keeps it when more are added', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addDogPhoto(dog.id, pic('a'))
    const b = await repo.addDogPhoto(dog.id, pic('b'))
    expect((await repo.getSnapshot()).dogs[0].primaryPhotoId).toBe(a.id)
    expect(await liveIds(dog.id)).toEqual(expect.arrayContaining([a.id, b.id]))
  })

  it('lets you choose a different cover, but only from that dog\'s own photos', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const other = await repo.logSighting({ breedId: 'dachshund', metAt: 2, photo: pic('x') })
    await repo.addDogPhoto(dog.id, pic('a'))
    const b = await repo.addDogPhoto(dog.id, pic('b'))
    await repo.setPrimaryPhoto(dog.id, b.id)
    expect((await repo.getSnapshot()).dogs.find((d) => d.id === dog.id)?.primaryPhotoId).toBe(b.id)
    await expect(repo.setPrimaryPhoto(dog.id, other.dog.primaryPhotoId!)).rejects.toThrow(/not found/)
  })

  it(`allows at most ${MAX_PHOTOS_PER_DOG} per dog, and deleting frees a slot`, async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const made = []
    for (let i = 0; i < MAX_PHOTOS_PER_DOG; i++) made.push(await repo.addDogPhoto(dog.id, pic(String(i))))
    await expect(repo.addDogPhoto(dog.id, pic('extra'))).rejects.toThrow(/up to/)
    await repo.deletePhoto(made[3].id)
    await expect(repo.addDogPhoto(dog.id, pic('extra'))).resolves.toBeDefined()
  })

  it('deleting a photo erases its image data but leaves a small record for syncing', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addDogPhoto(dog.id, pic('a'))
    const b = await repo.addDogPhoto(dog.id, pic('b'))
    await repo.deletePhoto(b.id)
    const row = await repoDb().photos.get(b.id)
    expect(row?.deletedAt).toBeTruthy()
    // (the fake database in tests hands Blobs back without methods, hence `?? 0`; in a real browser size is 0)
    expect(row?.blob.size ?? 0).toBe(0)
    expect(row?.thumb.size ?? 0).toBe(0)
    expect(await liveIds(dog.id)).toEqual([a.id])
    await repo.deletePhoto(b.id) // deleting twice is harmless
  })

  it('hands the cover to the next photo when the cover is deleted, and to nothing when the last one goes', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addDogPhoto(dog.id, pic('a'))
    await new Promise((r) => setTimeout(r, 3))
    const b = await repo.addDogPhoto(dog.id, pic('b'))
    await repo.deletePhoto(a.id)
    expect((await repo.getSnapshot()).dogs[0].primaryPhotoId).toBe(b.id)
    await repo.deletePhoto(b.id)
    expect((await repo.getSnapshot()).dogs[0].primaryPhotoId).toBeUndefined()
  })

  it('keeps the cover when a different photo is deleted', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addDogPhoto(dog.id, pic('a'))
    const b = await repo.addDogPhoto(dog.id, pic('b'))
    await repo.deletePhoto(b.id)
    expect((await repo.getSnapshot()).dogs[0].primaryPhotoId).toBe(a.id)
  })

  it('a photo added after the cover was deleted becomes the new cover', async () => {
    const { dog } = await repo.logSighting({ breedId: 'beagle', metAt: 1 })
    const a = await repo.addDogPhoto(dog.id, pic('a'))
    await repo.deletePhoto(a.id)
    const c = await repo.addDogPhoto(dog.id, pic('c'))
    expect((await repo.getSnapshot()).dogs[0].primaryPhotoId).toBe(c.id)
  })
})

describe('photo order', () => {
  it('keeps photos in the order they were added, even when added in the same millisecond', async () => {
    const dbX = createDb(`photo-order-${n++}`)
    const r = createLocalRepo(dbX)
    const { dog } = await r.logSighting({ breedId: 'beagle', metAt: 1 })
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const ids: string[] = []
    for (let i = 0; i < 6; i++) ids.push((await r.addDogPhoto(dog.id, { blob: new Blob([String(i)]), thumb: new Blob([String(i)]), width: 1, height: 1 })).id)
    spy.mockRestore()
    const stored = (await dbX.photos.where('dogId').equals(dog.id).toArray()).sort((a, b) => a.createdAt - b.createdAt).map((p) => p.id)
    expect(stored).toEqual(ids)
    expect(new Set((await dbX.photos.toArray()).map((p) => p.createdAt)).size).toBe(6)
  })
})

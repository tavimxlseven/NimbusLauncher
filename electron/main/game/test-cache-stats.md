# Manual Test Plan for Cache Statistics in Progress Messages

## Test Objective
Verify that progress messages during mod download include cache statistics in the format "Mods: X/Y (Z cached)".

## Prerequisites
- NimbusLauncher installed and configured
- Access to a modpack with multiple mods
- Backend API accessible

## Test Cases

### Test Case 1: Fresh Installation (No Cache)
**Expected Result:** All mods should show as downloaded, cache count should be 0

1. Clear the mod cache directory
2. Launch a modpack with 10+ mods
3. Observe progress messages

**Expected Progress Messages:**
- `Mods: 1/10 (0 cached) — Mod Name (Source)`
- `Mods: 2/10 (0 cached) — Mod Name (Source)`
- ...
- `Mods: 10/10 (0 cached) — todos baixados`

**Verification:**
- [ ] Progress messages show "(0 cached)" throughout
- [ ] Final message shows total with cache count
- [ ] `cacheStats` in detail object shows: `{ total: 10, cached: 0, downloaded: 10, failed: 0 }`

### Test Case 2: Partial Cache Hit
**Expected Result:** Some mods from cache, some downloaded

1. Launch a modpack that was previously installed
2. Delete 3 mods from the cache
3. Launch the same modpack again
4. Observe progress messages

**Expected Progress Messages:**
- `Mods: 1/10 (1 cached) — Mod Name (Source)` (cache hit)
- `Mods: 2/10 (1 cached) — Mod Name (Source)` (downloading)
- `Mods: 3/10 (2 cached) — Mod Name (Source)` (cache hit)
- ...
- `Mods: 10/10 (7 cached) — todos baixados`

**Verification:**
- [ ] Cache count increments only for cache hits
- [ ] Final message shows correct cache count
- [ ] `cacheStats` shows: `cached + downloaded + failed = total`

### Test Case 3: All Mods Cached
**Expected Result:** All mods served from cache

1. Launch a modpack that was previously installed
2. Ensure all mods are in cache
3. Launch the same modpack again
4. Observe progress messages

**Expected Progress Messages:**
- `Mods: 1/10 (1 cached) — Mod Name (Source)`
- `Mods: 2/10 (2 cached) — Mod Name (Source)`
- ...
- `Mods: 10/10 (10 cached) — todos baixados`

**Verification:**
- [ ] Cache count equals total count
- [ ] No downloads occur
- [ ] `cacheStats` shows: `{ total: 10, cached: 10, downloaded: 0, failed: 0 }`

### Test Case 4: Download Failures
**Expected Result:** Failed mods are counted separately

1. Launch a modpack with some mods that will fail to download
2. Observe progress messages

**Expected Progress Messages:**
- `Mods: 1/10 (0 cached) — Mod Name (Source)`
- `Mods: 2/10 (0 cached) — Falhou Mod Name: error message`
- ...
- `Mods: 10/10 (5 cached) — Aviso: 2 mod(s) falharam: ...`

**Verification:**
- [ ] Failed mods show in progress message
- [ ] Cache count doesn't include failed mods
- [ ] `cacheStats` shows: `cached + downloaded + failed = total`
- [ ] Final message includes warning about failures

### Test Case 5: Large Modpack (200+ mods)
**Expected Result:** Progress messages update correctly for large modpacks

1. Launch a large modpack (200+ mods)
2. Observe progress messages throughout
3. Verify final statistics

**Expected Behavior:**
- Progress messages update after each mod
- Cache count increments correctly
- Final message shows accurate statistics

**Verification:**
- [ ] All progress messages include cache count
- [ ] Cache count is accurate at the end
- [ ] Performance is acceptable (< 50ms per mod validation)

## Validation Criteria

For all test cases, verify:
1. ✅ Progress message format is "Mods: X/Y (Z cached)"
2. ✅ Cache count starts at 0 and increments only for cache hits
3. ✅ `cacheStats` object is included in `detail` field
4. ✅ Final statistics satisfy: `cached + downloaded + failed = total`
5. ✅ Progress messages are clear and informative

## Notes
- The cache statistics are tracked in the `CacheStatistics` interface
- Cache hits are determined by: file exists + SHA1 matches + JAR is valid
- Progress messages are emitted via the `progress` event
- The `detail` object includes `cacheStats` for programmatic access

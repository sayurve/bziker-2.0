# Нативные fixtures: шесть тестовых файлов V30

Повторяемый RED→GREEN: **109 тестов,99PASS/10FAIL →109PASS/0FAIL**, skip0. RED exit1, GREEN exit0. Только шесть запрошенных файлов и `helpers/native-avatar-fixture-v30.mjs`; runtime и арт не изменены.

Команда из `game/`:

```sh
/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/actor-actions-v12.test.mjs tests/canonical-idle-runtime.test.mjs tests/canonical-shared-head-v27.test.mjs tests/community-interior-plans.test.mjs tests/furniture-render-v16.test.mjs tests/world-lifecycle.test.mjs
```

Логи: `verification/scoped-fixture-modernization-red-v30.log`, `verification/scoped-fixture-modernization-green-v30.log`. SHA логов, тестов и runtime snapshot сохранены в `scoped-fixture-modernization-v30.json`.

## actor-actions-v12.test.mjs

Preload actual coarse/fine PNGs; observe nonempty factor2 native raster/runs. Verify authored smoking timeline0/1/1/2/2/1/1/0, fixed native ground125 and anchor24,63; exact static neutral seated phone and visible native props. Independent whole-body shoe silhouettes are not equated to idle shoe RGBA. Server action-stage tests remain unchanged.

## canonical-idle-runtime.test.mjs

Contract fixture now isolates separately reviewed A/L supplements while retaining real actor shader/masks. Fixture head contains complete neck/eye metadata and real nonempty Napi pixels; full defaultAvatar and parts are passed. Canonical standing phone explicitly keeps idle. Existing real-resource preload/approval/rejection tests remain.

## canonical-shared-head-v27.test.mjs

Use own female donor and verified donor/body hashes. Every male opaque donor pixel remains exact. Every visible female donor pixel alpha>127 is checked against literal source-over composition with its recorded body or explicit approved neckRepair body, covering roughly1700–1800 actual headpixels per frame. Preserve5poses per model/direction, integer headtranslation, fixed96x128/48x64 canvas/anchor, native ground125, donor-derived crown and exact uniform body scalar .10625male/.1female; obsolete4px fullheight difference removed.

## community-interior-plans.test.mjs

Phone assertion now requires actual seated family frame0, phone prop, exact same neutral source rect, selected facing and existing authoritative seat coords; obsolete phone-seated substring removed.

## furniture-render-v16.test.mjs

Preload actual both-model PNGs and reject source-loading/empty raster; real seated frame0 head mask ends at actual authored neck rather than fixed37logical row. Foreground cannot change any observed head-region RGBA, with positive nonempty head coverage.

## world-lifecycle.test.mjs

Preload native PNGs. Scene observer decodes actual96x128 bitmap drawImage with actual nearest-neighbour destination scaling. Shoe ink uses actual factor2 grid dimensions. Blocked and peer motion tests retain positive foot coverage and exact pixel equality, settled idle/stationary feet checks, authoritative positions and distance phase; moving expectation uses same running:true as world renderer.

Границы результата: проверены109 тестов этих6 файлов. Полный набор919 здесь не запускался. Проход тестов не подтверждает художественную приёмку, браузер или физический телефон.

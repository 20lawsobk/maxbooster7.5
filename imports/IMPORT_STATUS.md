# Max Booster repository import

- Repository: https://github.com/20lawsobk/maxbooster7.5.git
- Branch: main
- Source commit: 5d5f8f57394cfc95bb73588e2bf68795db71252e
- Source directory: `imports/maxbooster7.5`
- Verification: all 11,327 tracked blobs match their Git object hashes; no missing or modified blobs.
- Original source, dependency lockfiles, and configuration were preserved without migration into the template workspace.
- Dependencies have not been installed and the application has not been started. The existing template workflows do not run the imported application.

## Unavailable upstream content

GitHub's LFS server rejected downloads with: "This repository exceeded its LFS budget." These two files retain their original LFS pointers rather than the model contents:

- `.pdim-scratch-external_maxcore-989/external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt`
- `external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt`

The repository also records a Gitlink at `maxbooster7.5` pointing to commit `2c9b739a89bb2334142ded99da14fe57878208b1`. There is no `.gitmodules` file specifying where that content can be downloaded. The Gitlink's contents are therefore not imported.

Large generated reports, scratch data, hardware build outputs, and sample audio remain present locally. Root ignore rules exclude these from new checkpoints and deployments to avoid adding large generated assets to this project's history.

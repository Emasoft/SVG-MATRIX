```markdown
# SVG-MATRIX

Arbitrary-precision matrix, vector and affine transformation library for JavaScript using decimal.js.

[...]

CI & Releases
- A GitHub Actions test workflow runs tests on push/pull_request.
- A release workflow creates a GitHub Release when you push a tag (e.g. `v1.0.0`). The workflow will:
  - run tests,
  - create the GitHub Release for the tag,
  - and optionally publish to npm if a repository secret `NPM_TOKEN` is set.
- If you prefer not to store an NPM token in the repository (you mentioned you use trusted publishing), you can leave `NPM_TOKEN` unset; the workflow will skip the automatic npm publish step and still create the GitHub Release. You can then publish to npm locally using your usual trusted publishing flow:
  npm login
  npm publish --access public

To enable automatic publishing from the workflow later:
1. Create an npm token (with publish rights).
2. Add it to your repo as a secret named `NPM_TOKEN` (Settings → Secrets → Actions).
3. Push a tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`) and the workflow will publish automatically.

Notes
- Trusted/local publishing: you can continue to publish the package locally (the workflow will still create the GitHub Release).
- If you'd like the workflow to fail when NPM_TOKEN is missing (rather than skip publish), tell me and I’ll change the behavior.
```
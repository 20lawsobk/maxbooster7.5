# Max Booster test guide

The maintained guide is [docs/testing/README.md](../docs/testing/README.md).
It covers tool installation, dependencies, safe isolated execution, every test
group, selecting individual tests, and interpreting results.

- [Every test file and what it does](../docs/testing/catalog.md)
- [Recorded rerun results and remaining failures](../docs/testing/results.md)
- [Python tests](../docs/testing/python.md)
- [Commerce and beat lifecycle tests](../docs/testing/commerce.md)
- [Browser, HTTP integration and 80-page acceptance](../docs/testing/integration-browser.md)
- [Rust, Go and imported subsystem tests](../docs/testing/subsystems.md)

```sh
npm run test:catalog:check
npm run test:all -- --plan
npm run test:all -- --python /path/to/prepared/python
```

The previous nine-file Jest description and proposed coverage targets were
outdated. Current tests use Vitest, Node's test runner, pytest/unittest, Cargo,
Go and explicit isolated/browser runners. No code coverage percentage is
claimed by the test catalog or by a passing subset.

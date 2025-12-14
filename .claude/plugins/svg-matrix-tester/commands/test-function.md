---
name: test-function
description: Test a specific svg-toolbox function
arguments:
  - name: function
    description: Function name to test (e.g., optimize, flattenAll)
    required: true
  - name: suite
    description: Test suite (svg11, svg2, or all)
    required: false
    default: all
---

Test the specified svg-toolbox function against the test suite.

```bash
node tests/utils/svg-function-test-runner.mjs {{function}} --suite {{suite}}
```

After the test completes, read and report the results from:
`tests/results/{{suite}}/{{function}}/test-report.json`

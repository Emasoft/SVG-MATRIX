---
name: test-svg-toolbox
description: Test all 71 svg-toolbox functions against SVG test suites
arguments:
  - name: suite
    description: Test suite to use (svg11, svg2, or all)
    required: false
    default: svg11
---

Test all svg-toolbox functions against the specified test suite.

Run the test runner for each of the 71 functions:

```bash
for func in addAttributesToSVGElement addClassesToSVGElement applyPreset cleanupAttributes cleanupEnableBackground cleanupIds cleanupListOfValues cleanupNumericValues collapseGroups convertColors convertEllipseToCircle convertPathData convertShapesToPath convertStyleToAttrs convertTransform decomposeTransform detectCollisions fixInvalidSVG flattenAll flattenClipPaths flattenFilters flattenGradients flattenMasks flattenPatterns flattenUseElements imageToPath inlineStyles measureDistance mergePaths minifyStyles moveElemsAttrsToGroup moveGroupAttrsToElems optimize optimizeAnimationTiming optimizePaths prefixIds presetDefault presetNone removeAttrs removeAttributesBySelector removeComments removeDesc removeDimensions removeDoctype removeEditorsNSData removeElementsByAttr removeEmptyAttrs removeEmptyContainers removeEmptyText removeHiddenElements removeMetadata removeNonInheritableGroupAttrs removeOffCanvasPath removeRasterImages removeScriptElement removeStyleElement removeTitle removeUnknownsAndDefaults removeUselessDefs removeViewBox removeXlink removeXMLNS removeXMLProcInst reusePaths simplifyPath simplifyPaths sortAttrs sortDefsChildren validateSVG validateSVGAsync validateXML; do
  node tests/utils/svg-function-test-runner.mjs "$func" --suite {{suite}}
done
```

Collect all test-report.json files and summarize results.

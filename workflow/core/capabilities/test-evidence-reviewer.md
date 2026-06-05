# Capability: test-evidence-reviewer

- **Tier**: optional
- **Stage**: `/06`, `/07`
- **Purpose**: Verify that the test suite actually proves the intended behavior, including negative cases, boundary cases, compatibility matrices, and explicitly skipped paths.

## Why

A passing suite is not the same as adequate coverage. Reviews documented after the fact frequently surface defects that were never represented in any test case. A focused review pass on test evidence catches the missing matrix rows that an ordinary "are tests passing" check ignores.

## Inputs

- The PRD acceptance criteria from `02-产品文档.md`
- The implementation scope from `04-代码实现.md`
- The test plan from `06-测试用例.md`
- Real test output from `07-测试执行.md`

## Outputs

```yaml
result: PASS | WARN | BLOCK
coverage_review:
  - acceptance: "<acceptance criterion>"
    direct_tests:
      - "<test name>"
    missing_paths:
      - "negative case"
      - "compatibility entry"
      - "boundary"
    verdict: covered | partial | missing
recommended_followup:
  - "Add a negative path test for <criterion>."
```

## Blocking Rules

- Block when an explicit acceptance criterion has no direct test and the team has not recorded a documented exception.
- Downgrade to WARN when a negative or boundary path is missing but the impact is documented.

## Adapter Examples

- **L0**: A required mapping table in the test plan template.
- **L1**: A prompt that reads the acceptance criteria and asks the user to list a test per criterion.
- **L2**: A slash command that builds the mapping table automatically.
- **L3**: A hook that warns when the test plan has unmapped criteria.
- **L4**: A subagent dedicated to coverage review.

## Anti-Patterns

- Counting "tests passing" as coverage.
- Skipping negative cases because "the happy path looks correct".
- Considering compatibility entries covered when only one entry has tests.
- Promoting partial coverage to "covered" because the timeline is tight.

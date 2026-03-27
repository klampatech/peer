# Frontend Evaluation

## Lint Results
**fail** - 1 error

- `src/pages/RoomPage.tsx:34` - React Hook "useEffect" is called conditionally. React Hooks must be called in the exact same order in every component render (react-hooks/rules-of-hooks)

## Test Results
**pass** - 152 tests, 0 failures

## Typecheck Results
**pass** - 0 errors

## Issues Found
1. **Conditional React Hook call** (`src/pages/RoomPage.tsx:34`): `useEffect` is called inside a conditional block, which violates the Rules of Hooks. This must be moved to the top level of the component with the condition checked inside the effect, or the logic must be refactored to ensure hooks are always called in the same order.

# Unfinished Work and Technical Debt

This document tracks identified TODOs, FIXMEs, and incomplete implementations within the BabaDeluxe codebase.

## High Priority / Functional

## Technical Debt / Refactoring

## UI/UX Improvements

### Error Boundaries

- **ViewErrorBoundary**: Currently wraps roots in a `div` to support transitions, but could be improved to handle specific error types more gracefully or provide better recovery options for end-users.

### Prompt Library

- **Validation**: Current prompt validation is basic (mostly length and presence). Could be improved with regex for command names or template syntax highlighting.

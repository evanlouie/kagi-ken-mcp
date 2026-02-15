# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-02-15

### Added

- Package version is now included in server startup and failure log messages

## [1.2.0] - 2026-02-15

### Fixed

- Search results no longer include related searches (`t: 1`) as broken entries with "No Title" and "No snippet available" (#3)

### Changed

- Bumped kagi-ken dependency to 1.3.0 (summarizer fixes for Kagi's updated streaming API format)

## [1.1.0] - 2025-10-17

### Added

- Optional `limit` parameter to `kagi_search_fetch` tool to control maximum number of search results per query
- Default limit of 10 results when no limit is specified
- Input validation for limit parameter (1-50 results)
- Updated tool description to mention limit functionality

### Changed

- Enhanced `kagiSearchFetch()` to apply limit per individual query
- Updated Zod schema to include optional limit field with validation

### Technical Details

- Limit parameter is passed through to core `kagi-ken` package's `search()` function
- Each query in the array gets its own limit applied (not global across all queries)
- Related searches are always included regardless of limit (handled by core package)
- Backward compatible - existing usage without limit continues to work

## [1.0.0] - 2025-08-13

Initial release!

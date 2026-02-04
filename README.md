# Prospect Miner

A deterministic, restartable B2B prospect mining system capable of generating 200+ targeted leads per day.

## Features

- **7-Stage Pipeline**: DISCOVER → COLLECT → FILTER → ENRICH → SCORE → OUTPUT → REFRESH
- **Persistent Lead State**: SQLite-based tracking across runs
- **Angle-Based Outreach**: Smart categorization of sales opportunities
- **Configurable Rules**: All thresholds and rules in YAML config
- **Fail-Soft Execution**: Partial failures don't crash the run
- **No LLM in Runtime**: Deterministic, predictable operation

## Requirements

- Node.js 18 or 20 LTS
- npm
- Linux server (headless) for production

## Installation

```bash
cd prospect-miner
npm install
npm run build
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_DIR` | Directory for output files | `~/.prospect-miner/data` |
| `CONFIG_DIR` | Directory for config files | `~/.prospect-miner/config` |
| `LOG_DIR` | Directory for log files | `~/.prospect-miner/logs` |
| `DB_PATH` | Path to SQLite database | `~/.prospect-miner/state.db` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |

## Usage

### Run Individual Stages

```bash
# Discover businesses from configured sources
npm run discover

# Normalize and deduplicate raw discoveries
npm run collect

# Apply rule-based filters
npm run filter

# Scrape websites for contact info
npm run enrich

# Compute scores and assign angles
npm run score

# Export campaign-ready leads
npm run output

# Re-evaluate leads for re-entry
npm run refresh
```

### Run Full Pipeline

```bash
npm run pipeline

# Or with options
node dist/cli/index.js pipeline --skip-enrich --limit 100
```

### Check Statistics

```bash
node dist/cli/index.js stats
```

### View/Reload Configuration

```bash
node dist/cli/index.js config
node dist/cli/index.js reload-config
```

## Configuration

Edit `config/config.yaml` to customize:

- **Sources**: Discovery sources (Yelp, Google Maps, etc.)
- **Filters**: Exclusion rules and keywords
- **Cooldowns**: How long before re-contacting leads
- **Scoring**: Weights and thresholds for lead scoring
- **Angles**: Outreach angle definitions
- **Output**: Export format and fields

## Pipeline Stages

### 1. DISCOVER
Identifies businesses from configured sources (directories, maps, registries).

### 2. COLLECT
Normalizes names, generates stable IDs, deduplicates records.

### 3. FILTER
Applies rule-based exclusions based on config + lead state.

### 4. ENRICH
Scrapes websites for emails, phones, social links, and booking signals.

### 5. SCORE
Computes numeric scores and assigns outreach angles:
- `no_website` - Business lacks web presence
- `outdated_website` - Website appears neglected
- `low_reviews` - Few customer reviews
- `poor_ratings` - Below-average ratings
- `no_online_booking` - No appointment scheduling
- `founder_led` - Small business likely founder-operated

### 6. OUTPUT
Exports campaign-ready CSV/JSON with all required fields.

### 7. REFRESH
Re-evaluates leads when cooldowns expire or signals change.

## Cron Setup

For automated daily runs on Linux:

```bash
# Run full pipeline daily at 2am
0 2 * * * cd /path/to/prospect-miner && npm run pipeline >> /var/log/prospect-miner.log 2>&1

# Run refresh weekly on Sundays
0 3 * * 0 cd /path/to/prospect-miner && npm run refresh >> /var/log/prospect-miner.log 2>&1
```

## LinkedIn Usage (Optional)

LinkedIn enrichment is **disabled by default** and strictly read-only:
- Never used as primary discovery
- Only confirms decision-maker presence, company size
- Fully disableable via `linkedIn.enabled: false`
- No messaging or automation

## Database

SQLite database contains:
- `leads` - Persistent lead state
- `runs` - Pipeline execution history
- `raw_discoveries` - Staging area before collection

## License

MIT

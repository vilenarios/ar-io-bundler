# Turbo Payment Service

Welcome to the Turbo Payment Service 👋

## Local Development

### Requirements

For a compatible development environment, we require the following packages installed on the system:

- `yarn`
- `nvm` (optional)
- `husky` (optional)
- `docker` (optional)

### Running Locally

With a compatible system, follow these steps to start the upload service:

- `cp .env.sample .env` (and update values)
- `yarn`
- `yarn build`
- `yarn db:up`
- `yarn start`
  - alternatively use `yarn start:watch` to run the app in development mode with hot reloading provided by `nodemon`

Note: we store credentials for the service in AWS - to avoid these requests - set your NODE_ENV to `test` in your .env file.

## Database

The service relies on a postgres database. The following scripts can be used to create a local postgres database via docker:

- `yarn db:up`: Starts a local docker PostgreSQL container on port 5432
- `yarn db:migrate:latest`: Runs migrations on a local PostgreSQL database
- `yarn db:down`: Tears down local docker PostgreSQL container and deletes the db volume

### Migrations

Knex is used to create and run migrations. To make a migration follow these steps:

1. Add migration function and logic to `schema.ts`
2. Run the yarn command to stage the migration, which generates a new migration script in `migrations/` directory

- `yarn db:make:migration MIGRATION_NAME`

3. Update the new migration to call the static function created in step 1.

4. Run the migration

- `yarn db:migration:latest` or `yarn knex migration:up MIGRATION_NAME.TS`

### Rollbacks

You can rollback knex migrations using the following command:

- `yarn db:migrate:rollback` - rolls back the most recent migration
- `yarn db:migrate:rollback --all` - rolls back all migrations
- `yarn knex migrate:list` - lists all the migrations applied to the database
- `yarn knex migrate:down MIGRATION_NAME.ts --knexfile src/database/knexfile.ts` - rolls back a specific migration

Additional `knex` documentation can be found [here](https://knexjs.org/guide/migrations.html).

### Docker

To run this service and a connected postgres database, fully migrated.

- `cp .env.sample .env` (and update values)
- `yarn start:docker` - run the local service and postgres database in docker containers

Alternatively, you can run the service in docker and connect to a local postgres database. You will need to standup `postgres` in a separate container.

```bash
docker run --name turbo-payment-service-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
docker run --env-file .env -p 4000:4000 ghcr.io/ardriveapp/turbo-payment-service:latest
```

## Tests

Unit and integration tests can be run locally or via docker. For either, you can set environment variables for the service via a `.env` file:

### Unit Tests

- `yarn test:unit` - runs unit tests locally

### Integration Tests

- `yarn test:integration:local` - runs the integration tests locally against postgres docker container
- `yarn test:integration:local -g "Router"` - runs targeted integration tests against postgres docker container
  - `watch -n 30 'yarn test:integration:local -g "Router'` - runs targeted integration tests on an interval (helpful when actively writing tests)
- `yarn test:docker` - runs integration tests (and unit tests) in an isolated docker container

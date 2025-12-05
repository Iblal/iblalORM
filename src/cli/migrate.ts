#!/usr/bin/env ts-node
/**
 * IblalORM CLI - Migration Commands
 *
 * Commands:
 *   migrate:create <name>  - Create a new migration file
 *   migrate:run            - Run all pending migrations
 *   migrate:status         - Show migration status
 */

import { getMigrationManager } from "../migrations/MigrationManager";
import { getDbAdapter } from "../db/DbAdapter";

// Load environment variables
import "dotenv/config";

const COMMANDS = {
  create: createMigration,
  run: runMigrations,
  status: showStatus,
};

async function createMigration(args: string[]): Promise<void> {
  const name = args.join(" ");

  if (!name) {
    console.error("❌ Error: Migration name is required");
    console.log("   Usage: npm run migrate:create <name>");
    console.log('   Example: npm run migrate:create "add bio to users"');
    process.exit(1);
  }

  const manager = getMigrationManager();
  const filepath = manager.createMigration(name);

  console.log("\n✅ Migration created successfully!\n");
  console.log(`   File: ${filepath}\n`);
  console.log("   Edit the file to add your SQL statements,");
  console.log("   then run: npm run migrate:run\n");
}

async function runMigrations(): Promise<void> {
  console.log("\n🚀 IblalORM Migration Runner\n");
  console.log("============================\n");

  const manager = getMigrationManager();

  try {
    const executed = await manager.runAllPending();

    if (executed.length === 0) {
      console.log("   No pending migrations to run.\n");
    } else {
      console.log(`\n✨ Successfully ran ${executed.length} migration(s)!\n`);
    }
  } catch (error) {
    console.error("\n❌ Migration failed:");
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    }
    process.exit(1);
  } finally {
    await getDbAdapter().close();
  }
}

async function showStatus(): Promise<void> {
  console.log("\n📊 IblalORM Migration Status\n");
  console.log("============================\n");

  const manager = getMigrationManager();

  try {
    const status = await manager.getStatus();

    console.log("Executed migrations:");
    if (status.executed.length === 0) {
      console.log("   (none)\n");
    } else {
      status.executed.forEach((name) => {
        console.log(`   ✅ ${name}`);
      });
      console.log("");
    }

    console.log("Pending migrations:");
    if (status.pending.length === 0) {
      console.log("   (none)\n");
    } else {
      status.pending.forEach((m) => {
        console.log(`   ⏳ ${m.name}`);
      });
      console.log("");
    }
  } catch (error) {
    console.error("\n❌ Error getting migration status:");
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    }
    process.exit(1);
  } finally {
    await getDbAdapter().close();
  }
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || !COMMANDS[command as keyof typeof COMMANDS]) {
    console.log("\n🛠️  IblalORM Migration CLI\n");
    console.log("Available commands:");
    console.log("   migrate:create <name>  - Create a new migration file");
    console.log("   migrate:run            - Run all pending migrations");
    console.log("   migrate:status         - Show migration status\n");
    console.log("Usage:");
    console.log("   npx ts-node src/cli/migrate.ts migrate:create <name>");
    console.log("   npx ts-node src/cli/migrate.ts migrate:run");
    console.log("   npx ts-node src/cli/migrate.ts migrate:status\n");
    process.exit(0);
  }

  const handler = COMMANDS[command as keyof typeof COMMANDS];
  await handler(args);
}

main().catch(console.error);

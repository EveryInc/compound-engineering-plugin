#!/usr/bin/env bun
import { defineCommand, runMain } from "citty"
import packageJson from "../package.json"
import convert from "./commands/convert"
import install from "./commands/install"
import listCommand from "./commands/list"
import sync from "./commands/sync"

const main = defineCommand({
  meta: {
    name: "compound-plugin",
    version: packageJson.version,
    description: "Convert Claude Code plugins into other agent formats",
  },
  subCommands: {
    convert: () => convert,
    install: () => install,
    list: () => listCommand,
    sync: () => sync,
  },
})

runMain(main)

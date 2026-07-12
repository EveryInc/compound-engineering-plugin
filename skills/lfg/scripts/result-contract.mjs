import { promises as fs } from "node:fs"
import path from "node:path"

const JSON_SCHEMA_DIALECTS = new Set([
  "http://json-schema.org/draft-07/schema#",
  "https://json-schema.org/draft/2020-12/schema",
])
const JSON_SCHEMA_TYPES = new Set(["array", "boolean", "integer", "null", "number", "object", "string"])
const JSON_SCHEMA_KEYWORDS = new Set([
  "$id",
  "$schema",
  "additionalProperties",
  "const",
  "enum",
  "items",
  "minItems",
  "pattern",
  "properties",
  "required",
  "title",
  "type",
])
const MAX_ERRORS = 50

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const escapeJsonPointer = (value) => String(value).replaceAll("~", "~0").replaceAll("/", "~1")
const appendJsonPointer = (base, value) => `${base}/${escapeJsonPointer(value)}`

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

const jsonEqual = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))

class ResultContractError extends Error {
  constructor(message, details) {
    super(message)
    this.name = "ExecutionResolutionError"
    this.code = "invalid_result_contract"
    this.details = details
  }
}

function fail(message, details) {
  throw new ResultContractError(message, details)
}

function pushError(errors, error) {
  if (errors.length < MAX_ERRORS) errors.push(error)
}

const keywordPath = (schemaPath, keyword) => appendJsonPointer(schemaPath, keyword)

function inspectDialect(value, schemaPath, errors) {
  if (!JSON_SCHEMA_DIALECTS.has(value)) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "$schema"),
      keyword: "$schema",
      message: "must declare JSON Schema draft-07 or 2020-12",
    })
  }
}

function inspectType(value, schemaPath, errors) {
  const types = Array.isArray(value) ? value : [value]
  if (!types.length || types.some((type) => !JSON_SCHEMA_TYPES.has(type))) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "type"),
      keyword: "type",
      message: "contains an unsupported JSON type",
    })
  }
}

function inspectEnum(value, schemaPath, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "enum"),
      keyword: "enum",
      message: "must be a non-empty array",
    })
  }
}

function inspectRequired(value, schemaPath, errors) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string") || new Set(value).size !== value.length) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "required"),
      keyword: "required",
      message: "must be an array of unique strings",
    })
  }
}

function inspectMinItems(value, schemaPath, errors) {
  if (!Number.isInteger(value) || value < 0) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "minItems"),
      keyword: "minItems",
      message: "must be a non-negative integer",
    })
  }
}

function inspectPattern(value, schemaPath, errors) {
  if (typeof value !== "string") {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "pattern"),
      keyword: "pattern",
      message: "must be a string",
    })
    return
  }
  try {
    new RegExp(value)
  } catch {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "pattern"),
      keyword: "pattern",
      message: "must be a valid ECMA-262 regular expression",
    })
  }
}

function inspectProperties(value, schemaPath, errors) {
  if (!isObject(value)) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, "properties"),
      keyword: "properties",
      message: "must be an object",
    })
    return
  }
  for (const [name, propertySchema] of Object.entries(value)) {
    inspectSchema(propertySchema, appendJsonPointer(keywordPath(schemaPath, "properties"), name), errors)
  }
}

function inspectSubschema(keyword, value, schemaPath, errors) {
  if (typeof value !== "boolean" && !isObject(value)) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, keyword),
      keyword,
      message: "must be an object or boolean",
    })
    return
  }
  inspectSchema(value, keywordPath(schemaPath, keyword), errors)
}

const SCHEMA_INSPECTORS = [
  ["$schema", inspectDialect],
  ["type", inspectType],
  ["enum", inspectEnum],
  ["required", inspectRequired],
  ["minItems", inspectMinItems],
  ["pattern", inspectPattern],
  ["properties", inspectProperties],
  ["additionalProperties", (value, schemaPath, errors) => inspectSubschema("additionalProperties", value, schemaPath, errors)],
  ["items", (value, schemaPath, errors) => inspectSubschema("items", value, schemaPath, errors)],
]

function inspectSchema(schema, schemaPath = "#", errors = []) {
  if (typeof schema === "boolean") return errors
  if (!isObject(schema)) {
    pushError(errors, { schemaPath, keyword: "schema", message: "must be an object or boolean" })
    return errors
  }
  for (const keyword of Object.keys(schema).filter((keyword) => !JSON_SCHEMA_KEYWORDS.has(keyword))) {
    pushError(errors, {
      schemaPath: keywordPath(schemaPath, keyword),
      keyword,
      message: "is not supported by the bundled result-contract validator",
    })
  }
  for (const [keyword, inspect] of SCHEMA_INSPECTORS) {
    if (own(schema, keyword)) inspect(schema[keyword], schemaPath, errors)
  }
  return errors
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value)
  if (type === "boolean") return typeof value === "boolean"
  if (type === "integer") return Number.isInteger(value)
  if (type === "null") return value === null
  if (type === "number") return typeof value === "number" && Number.isFinite(value)
  if (type === "object") return isObject(value)
  if (type === "string") return typeof value === "string"
  return false
}

function validateConst(value, schema, instancePath, schemaPath, errors) {
  if (own(schema, "const") && !jsonEqual(value, schema.const)) {
    pushError(errors, {
      instancePath,
      schemaPath: keywordPath(schemaPath, "const"),
      keyword: "const",
      message: "must equal the declared constant",
    })
  }
}

function validateEnum(value, schema, instancePath, schemaPath, errors) {
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonEqual(value, candidate))) {
    pushError(errors, {
      instancePath,
      schemaPath: keywordPath(schemaPath, "enum"),
      keyword: "enum",
      message: "must equal one of the declared values",
    })
  }
}

function validateType(value, schema, instancePath, schemaPath, errors) {
  if (!own(schema, "type")) return true
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (types.some((type) => matchesType(value, type))) return true
  pushError(errors, {
    instancePath,
    schemaPath: keywordPath(schemaPath, "type"),
    keyword: "type",
    message: `must be ${types.join(" or ")}`,
  })
  return false
}

function validateRequired(value, schema, instancePath, schemaPath, errors) {
  if (!Array.isArray(schema.required)) return
  for (const name of schema.required) {
    if (!own(value, name)) {
      pushError(errors, {
        instancePath,
        schemaPath: keywordPath(schemaPath, "required"),
        keyword: "required",
        message: `must have required property ${JSON.stringify(name)}`,
      })
    }
  }
}

function validateProperties(value, schema, instancePath, schemaPath, errors) {
  const properties = isObject(schema.properties) ? schema.properties : {}
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (own(value, name)) {
      validateSchema(
        value[name],
        propertySchema,
        appendJsonPointer(instancePath, name),
        appendJsonPointer(keywordPath(schemaPath, "properties"), name),
        errors,
      )
    }
  }
  return properties
}

function validateAdditionalProperties(value, schema, properties, instancePath, schemaPath, errors) {
  if (!own(schema, "additionalProperties")) return
  for (const name of Object.keys(value).filter((key) => !own(properties, key))) {
    if (schema.additionalProperties === false) {
      pushError(errors, {
        instancePath,
        schemaPath: keywordPath(schemaPath, "additionalProperties"),
        keyword: "additionalProperties",
        message: `must not have additional property ${JSON.stringify(name)}`,
      })
    } else if (isObject(schema.additionalProperties)) {
      validateSchema(
        value[name],
        schema.additionalProperties,
        appendJsonPointer(instancePath, name),
        keywordPath(schemaPath, "additionalProperties"),
        errors,
      )
    }
  }
}

function validateObject(value, schema, instancePath, schemaPath, errors) {
  validateRequired(value, schema, instancePath, schemaPath, errors)
  const properties = validateProperties(value, schema, instancePath, schemaPath, errors)
  validateAdditionalProperties(value, schema, properties, instancePath, schemaPath, errors)
}

function validateArray(value, schema, instancePath, schemaPath, errors) {
  if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
    pushError(errors, {
      instancePath,
      schemaPath: keywordPath(schemaPath, "minItems"),
      keyword: "minItems",
      message: `must contain at least ${schema.minItems} items`,
    })
  }
  if (isObject(schema.items) || typeof schema.items === "boolean") {
    value.forEach((item, index) => validateSchema(
      item,
      schema.items,
      appendJsonPointer(instancePath, index),
      keywordPath(schemaPath, "items"),
      errors,
    ))
  }
}

function validatePattern(value, schema, instancePath, schemaPath, errors) {
  if (typeof value === "string" && typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
    pushError(errors, {
      instancePath,
      schemaPath: keywordPath(schemaPath, "pattern"),
      keyword: "pattern",
      message: "must match the declared pattern",
    })
  }
}

function validateSchema(value, schema, instancePath = "", schemaPath = "#", errors = []) {
  if (schema === true) return errors
  if (schema === false) {
    pushError(errors, { instancePath, schemaPath, keyword: "false schema", message: "must not be present" })
    return errors
  }
  if (!isObject(schema)) return errors
  validateConst(value, schema, instancePath, schemaPath, errors)
  validateEnum(value, schema, instancePath, schemaPath, errors)
  if (!validateType(value, schema, instancePath, schemaPath, errors)) return errors
  if (isObject(value)) validateObject(value, schema, instancePath, schemaPath, errors)
  if (Array.isArray(value)) validateArray(value, schema, instancePath, schemaPath, errors)
  validatePattern(value, schema, instancePath, schemaPath, errors)
  return errors
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"))
}

export async function loadResultContract({ workflowRegistryPath, workflowId } = {}) {
  if (typeof workflowRegistryPath !== "string" || !workflowRegistryPath) {
    fail("The selected workflow result contract could not be loaded.", {
      workflowId,
      registryPath: "",
      schemaPath: "",
      cause: "invalid_path",
    })
  }
  const registryPath = path.resolve(workflowRegistryPath)
  const schemaPath = path.resolve(path.dirname(registryPath), "..", "references", "orca-result.schema.json")
  let registry
  let schema
  try {
    [registry, schema] = await Promise.all([readJson(registryPath), readJson(schemaPath)])
  } catch (error) {
    fail("The selected workflow result contract could not be loaded.", {
      workflowId,
      registryPath,
      schemaPath,
      cause: error?.code || error?.name || "read_error",
    })
  }
  if (
    !isObject(registry)
    || registry.version !== "orca.workflow-registry/v1"
    || !isObject(registry.workflows)
    || !own(registry.workflows, workflowId)
  ) {
    fail("The selected workflow registry does not contain the resolved workflow.", {
      workflowId,
      registryPath,
      schemaPath,
    })
  }
  const schemaErrors = inspectSchema(schema)
  if (!isObject(schema) || !own(schema, "$schema")) {
    pushError(schemaErrors, { schemaPath: "#/$schema", keyword: "$schema", message: "is required" })
  }
  const properties = isObject(schema?.properties) ? schema.properties : {}
  const expectedSchema = properties.schema?.const
  const workflowFields = ["workflowId", "workflow_id"].filter((field) => own(properties, field))
  if (typeof expectedSchema !== "string") {
    pushError(schemaErrors, {
      schemaPath: "#/properties/schema/const",
      keyword: "const",
      message: "must declare the exact result schema identity",
    })
  }
  if (workflowFields.length !== 1) {
    pushError(schemaErrors, {
      schemaPath: "#/properties",
      keyword: "workflow identity",
      message: "must declare exactly one workflowId or workflow_id property",
    })
  }
  if (schemaErrors.length) {
    fail("The selected workflow result contract is invalid or unsupported.", {
      workflowId,
      registryPath,
      schemaPath,
      errors: schemaErrors,
    })
  }

  return Object.freeze({ schema, schemaPath, expectedSchema, workflowField: workflowFields[0], workflowId })
}

export function validateResultContract(contract, value) {
  const errors = []
  const actualSchema = isObject(value) ? value.schema : undefined
  const actualWorkflowId = isObject(value) ? value[contract.workflowField] : undefined
  if (actualSchema !== contract.expectedSchema) {
    pushError(errors, {
      instancePath: "/schema",
      schemaPath: "#/properties/schema/const",
      keyword: "identity",
      message: `must identify ${contract.expectedSchema}`,
    })
  }
  if (actualWorkflowId !== contract.workflowId) {
    pushError(errors, {
      instancePath: appendJsonPointer("", contract.workflowField),
      schemaPath: appendJsonPointer(appendJsonPointer("#/properties", contract.workflowField), "identity"),
      keyword: "identity",
      message: `must identify selected workflow ${contract.workflowId}`,
    })
  }
  validateSchema(value, contract.schema, "", "#", errors)
  if (errors.length) {
    fail("Hydrated ce-result.json does not satisfy the selected workflow result contract.", {
      workflowId: contract.workflowId,
      expectedSchema: contract.expectedSchema,
      schemaPath: contract.schemaPath,
      errors,
    })
  }
  return value
}

import { expect, test } from "bun:test"
import noTodo from "../lint-rules/no-todo.mjs"

test("no-todo flags a TODO comment", () => {
  expect(noTodo.pattern.test("// TODO: remove")).toBe(true)
  expect(noTodo.pattern.test("const todo = 1")).toBe(false)
})

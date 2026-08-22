import { expect, test } from "bun:test";
import { execute, parse } from "graphql";
import { schema } from "../../src/graphql/schema";

test("health query is available", async () => {
  const result = await execute({
    schema,
    document: parse("{ health }")
  });

  expect(result).toEqual({ data: { health: "ok" } });
});

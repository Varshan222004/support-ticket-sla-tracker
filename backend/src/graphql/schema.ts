import { createSchema } from "graphql-yoga";
import type { GraphQLContext } from "../context";
import { resolvers } from "./resolvers";

const schemaFile = Bun.file(new URL("./schema/root.graphql", import.meta.url));
const typeDefs = await schemaFile.text();

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });

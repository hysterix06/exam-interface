import { beforeAll } from "vitest";
import { ensureTypesReady } from "@/question-types/registry";

beforeAll(() => ensureTypesReady());

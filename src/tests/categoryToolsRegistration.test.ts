import { describe, it, expect } from 'vitest';
import CreateCategoryGroupTool from '../tools/CreateCategoryGroupTool';
import CreateCategoryTool from '../tools/CreateCategoryTool';
import UpdateCategoryTool from '../tools/UpdateCategoryTool';
import UpdateCategoryGroupTool from '../tools/UpdateCategoryGroupTool';
import { jsonSchemaObjectToZodShape } from '../utils/jsonSchemaToZod';

// Guards the registration contract: each tool must expose a ynab_-prefixed
// definition whose inputSchema survives the same zod conversion the MCP server
// runs at registration time (src/mcp/registerTools.ts).
const TOOLS = [
  { Tool: CreateCategoryGroupTool, name: 'ynab_create_category_group', required: ['name'] },
  { Tool: CreateCategoryTool, name: 'ynab_create_category', required: ['name'] },
  { Tool: UpdateCategoryTool, name: 'ynab_update_category', required: [] },
  { Tool: UpdateCategoryGroupTool, name: 'ynab_update_category_group', required: ['name'] },
] as const;

describe('category tools registration contract', () => {
  for (const { Tool, name, required } of TOOLS) {
    describe(name, () => {
      const def = new Tool().getToolDefinition();

      it('uses the expected ynab_ tool name', () => {
        expect(def.name).toBe(name);
        expect(def.name.startsWith('ynab_')).toBe(true);
      });

      it('is annotated as a write tool (so caches get invalidated)', () => {
        expect(def.annotations?.readOnlyHint).toBe(false);
        expect(def.annotations?.destructiveHint).toBe(false);
      });

      it('declares the expected required fields', () => {
        expect((def.inputSchema as any).required ?? []).toEqual(required);
      });

      it('has an inputSchema the server can convert to a zod shape', () => {
        const shape = jsonSchemaObjectToZodShape(def.inputSchema as any);
        expect(Object.keys(shape)).toContain('budgetId');
        expect(Object.keys(shape)).toContain('response_format');
      });
    });
  }
});

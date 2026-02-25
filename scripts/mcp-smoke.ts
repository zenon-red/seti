/**
 * MCP Smoke Test Script
 *
 * Integration test that spawns the MCP server and calls the web_search tool.
 * Prints raw MCP envelope and parsed TOON payload for verification.
 *
 * Usage:
 *   bun tsx scripts/mcp-smoke.ts [--query "your search query"]
 *
 * Environment:
 *   - Requires built server: bun run build
 *   - Optionally set provider API keys for actual search results
 *   - Without API keys, you'll get isError: true with provider errors
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { decode } from '@toon-format/toon';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

// Check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Parse command line arguments
function parseArgs(): { query: string } {
  const args = process.argv.slice(2);
  let query = 'cristiano ronaldo career goals';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' && args[i + 1]) {
      query = args[i + 1];
      break;
    }
  }

  return { query };
}

/**
 * Validate TOON structure for search results
 * Expected format: results[N]{title,url,description}: followed by N rows
 */
function validateTOONStructure(text: string): { valid: boolean; error?: string; resultCount?: number } {
  const lines = text.trim().split('\n');
  
  if (lines.length === 0) {
    return { valid: false, error: 'Empty TOON output' };
  }

  const headerLine = lines[0].trim();
  
  // Check header pattern: results[N]{field1,field2,field3}: or results[0]:
  // Empty arrays use simpler format without field list
  const headerWithFields = headerLine.match(/^results\[(\d+)\]\{([^}]+)\}:$/);
  const headerEmpty = headerLine.match(/^results\[(\d+)\]:$/);
  
  let expectedCount: number;
  
  if (headerWithFields) {
    expectedCount = parseInt(headerWithFields[1], 10);
    const fields = headerWithFields[2].split(',').map(f => f.trim());
    
    // Validate expected fields
    const expectedFields = ['title', 'url', 'description'];
    const hasAllFields = expectedFields.every(f => fields.includes(f));
    if (!hasAllFields) {
      return { valid: false, error: `Missing required fields. Expected: ${expectedFields.join(',')}, Got: ${fields.join(',')}` };
    }
  } else if (headerEmpty) {
    expectedCount = parseInt(headerEmpty[1], 10);
    // Empty format is only valid for count=0
    if (expectedCount !== 0) {
      return { valid: false, error: `Invalid TOON header for non-empty array: ${headerLine.substring(0, 50)}...` };
    }
  } else {
    return { valid: false, error: `Invalid TOON header: ${headerLine.substring(0, 50)}...` };
  }

  // Count data rows (skip header, skip empty lines)
  const dataRows = lines.slice(1).filter(line => line.trim().length > 0);
  
  if (dataRows.length !== expectedCount) {
    return { valid: false, error: `Row count mismatch. Expected: ${expectedCount}, Got: ${dataRows.length}` };
  }

  // Validate each row has at least 2 commas (3 fields) - only if there are rows
  for (let i = 0; i < dataRows.length; i++) {
    const commaCount = (dataRows[i].match(/,/g) || []).length;
    if (commaCount < 2) {
      return { valid: false, error: `Row ${i + 1} has insufficient fields (needs at least 3 comma-separated values)` };
    }
  }

  return { valid: true, resultCount: expectedCount };
}

/**
 * Extract results from decoded TOON data for pretty-printing
 */
function extractResultsFromDecoded(decoded: { results?: Array<Record<string, unknown>> }): Array<{ title: string; url: string; description: string }> {
  if (!Array.isArray(decoded.results)) {
    return [];
  }
  
  return decoded.results.map(r => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    description: String(r.description ?? ''),
  }));
}

async function main(): Promise<void> {
  const { query } = parseArgs();

  console.log('='.repeat(60));
  console.log('MCP Smoke Test (TOON Format)');
  console.log('='.repeat(60));
  console.log(`Query: "${query}"`);
  console.log('');

  // Create transport that spawns the server
  // Detect if we're running from built dist or tsx source
  const isCompiled = await fileExists('dist/index.js');
  const transport = new StdioClientTransport({
    command: isCompiled ? 'node' : 'npx',
    args: isCompiled ? ['dist/index.js'] : ['tsx', 'src/index.ts'],
  });

  // Create MCP client
  const client = new Client(
    {
      name: 'smoke-test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    // Connect to server
    console.log('Connecting to MCP server...');
    await client.connect(transport);
    console.log('Connected successfully!\n');

    // Call web_search tool
    console.log('Calling web_search tool...');
    console.log('-'.repeat(60));

    const result = (await client.callTool({
      name: 'web_search',
      arguments: {
        query,
        num_results: 3,
      },
    })) as CallToolResult;

    // Print raw MCP envelope
    console.log('RAW MCP ENVELOPE:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log('-'.repeat(60));

    // Parse and validate TOON content
    if (result.content && result.content.length > 0) {
      const textContent = result.content[0];

      if (textContent.type === 'text') {
        const toonText = textContent.text;
        
        console.log('TOON RAW OUTPUT:');
        console.log(toonText);
        console.log('');
        console.log('-'.repeat(60));

        // Official TOON decoder is the source of truth
        console.log('OFFICIAL TOON DECODER:');
        let decoded: { results?: Array<Record<string, unknown>> };
        try {
          decoded = decode(toonText) as { results?: Array<Record<string, unknown>> };
          const decodedResults = decoded.results;
          if (Array.isArray(decodedResults)) {
            console.log(`  ✅ Parsed ${decodedResults.length} results`);
          } else {
            console.log('  ❌ Official decoder returned unexpected structure');
            process.exit(1);
          }
        } catch (decodeError) {
          console.log(`  ❌ Official decoder error: ${decodeError}`);
          process.exit(1);
        }

        // Validate TOON structure (secondary check)
        console.log('');
        console.log('STRUCTURE VALIDATION:');
        const validation = validateTOONStructure(toonText);
        
        if (!validation.valid) {
          console.log(`  ❌ INVALID: ${validation.error}`);
          console.log('');
          console.log('='.repeat(60));
          console.log('isError: true (TOON validation failed)');
          console.log('='.repeat(60));
          process.exit(1);
        }

        console.log(`  ✅ Valid TOON structure`);
        console.log(`  📊 Results declared: ${validation.resultCount}`);

        // Display results (using official decoder data)
        const results = extractResultsFromDecoded(decoded);
        
        console.log('');
        console.log('-'.repeat(60));
        console.log(`RESULTS (${results.length}):`);
        
        if (results.length === 0) {
          console.log('  (No results returned)');
        } else {
          for (const [i, r] of results.entries()) {
            console.log(`  ${i + 1}. ${r.title}`);
            console.log(`     URL: ${r.url}`);
            console.log(`     Desc: ${r.description.substring(0, 60)}${r.description.length > 60 ? '...' : ''}`);
          }
        }
      }
    }

    // Print isError flag
    console.log('');
    console.log('='.repeat(60));
    console.log(`isError: ${result.isError ?? false}`);
    console.log('='.repeat(60));

    // Summary
    if (result.isError) {
      console.log('\n⚠️  Server returned error (expected if no API keys configured)');
      process.exit(0); // Still success from smoke test perspective
    } else {
      console.log('\n✅ Smoke test completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Smoke test failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    try {
      await client.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}

main();

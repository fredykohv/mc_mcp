#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pathfinderPkg;
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type TextContent =
{
	type: 'text';
	text: string;
}

type ContentItem = TextContent;

type McpResponse =
{
	content: ContentItem[];
	_meta?: Record<string, unknown>;
	isError?: boolean;
	[key: string]: unknown;
}

interface InventoryItem
{
	name: string;
	count: number;
	slot: number;
}

interface FaceOption
{
	direction: string;
	vector: Vec3;
}

type Direction = 'foward' | 'back' | 'left' | 'right';
type FaceDirection = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';

function parseCommandLineArgs() 
{
  	return yargs(hideBin(process.argv))
		.option('host', 
		{
			type: 'string',
			description: 'Minecraft server host',
			default: 'localhost'
		})
		.option('port', 
		{
			type: 'number',
			description: 'Minecraft server port',
			default: 25565
		})
		.option('username', 
		{
			type: 'string',
			description: 'Bot username',
			default: 'LLMBot'
		})
		.help()
		.alias('help', 'h')
		.parseSync();
}

function createResponse(text: string): McpResponse 
{
	return {
		content: [{ type: "text", text }]
	};
}

function createErrorResponse(error: Error | string): McpResponse 
{
	const errorMessage = typeof error === 'string' ? error : error.message;
	console.error(`Error: ${errorMessage}`);

	return {
		content: [{ type: "text", text: `Failed: ${errorMessage}` }],
		isError: true
	};
}

// ========== Bot Setup ==========

function setupBot(argv: any) 
{
	// Configure bot options based on command line arguments
	const botOptions = 
	{
		host: argv.host,
		port: argv.port,
		username: argv.username,
		plugins: { pathfinder },
	};

	// Log connection information
	console.error(`Connecting to Minecraft server at ${argv.host}:${argv.port} as ${argv.username}`);

	// Create a bot instance
	const bot = mineflayer.createBot(botOptions);

	// Set up the bot when it spawns
	bot.once('spawn', async () => 
	{
		console.error('Bot has spawned in the world');

		// Set up pathfinder movements
		const mcData = minecraftData(bot.version);
		const defaultMove = new Movements(bot, mcData);
		bot.pathfinder.setMovements(defaultMove);

		bot.chat('Claude-powered bot ready to receive instructions!');

		// Add movement logging
		bot.on('move', () => {
			const pos = bot.entity.position;
			console.error(`Bot moved to: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
		});
	});

	// Register common event handlers
	bot.on('chat', (username, message) => 
	{
		if (username === bot.username) return;
		console.error(`[CHAT] ${username}: ${message}`);
	});

	bot.on('kicked', (reason) => 
	{
		console.error(`Bot was kicked: ${reason}`);
	});

	bot.on('error', (err) => 
	{
		console.error(`Bot error: ${err.message}`);
	});

	return bot;
}

// ========== MCP Server Configuration ==========

function createMcpServer(bot: any) 
{
	const server = new McpServer(
	{
		name: "minecraft-bot",
		version: "1.0.0",
	});

	// Register all tool categories
	registerPositionTools(server, bot);
	/*
	registerInventoryTools(server, bot);
	registerBlockTools(server, bot);
	registerEntityTools(server, bot);
	registerChatTools(server, bot);
	registerFlightTools(server, bot);
	registerGameStateTools(server, bot);
	*/

	return server;
}

function registerPositionTools(server: McpServer, bot: any)
{
	server.tool(
		"get-position",
		"Get the current position of the bot",
		{}, // Empty object for no parameters
		async (): Promise<McpResponse> =>
		{
			try
			{
				// Move the bot slightly to force a position update
				const originalY = bot.entity.position.y;
				await bot.setControlState('jump', true);
				await new Promise(res => setTimeout(res, 250)); // Jump for 250ms
				await bot.setControlState('jump', false);
				// Wait for the bot to land (or timeout after 1s)
				await new Promise(res => setTimeout(res, 500));

				const position = bot.entity.position;
				const pos = 
				{
					x: Math.floor(position.x),
					y: Math.floor(position.y),
					z: Math.floor(position.z)
				};
				
				console.log(`Current position: (${pos.x}, ${pos.y}, ${pos.z})`);
				return createResponse(`Current position: (${pos.x}, ${pos.y}, ${pos.z})`);
			}
			catch (error)
			{
				return createErrorResponse(error as Error);
			}
		}
	)
}

async function main()
{
    let bot: mineflayer.Bot | undefined;

	try
	{
		const argv = parseCommandLineArgs();

		bot = setupBot(argv);

		const server = createMcpServer(bot);

		process.stdin.on('end', () => 
		{
			console.error("Claude has disconnected. Shutting down...");
			if (bot) 
			{
				bot.quit();
			}
			process.exit(0);
		});

		// Connect to the transport
		const transport = new StdioServerTransport();
		await server.connect(transport);
		console.error("Minecraft MCP Server running on stdio");
	} 
	catch (error) 
	{
		console.error("Failed to start server:", error);
		if (bot) bot.quit();
		process.exit(1);
	}
}

// Call main() to start the server
main().catch(console.error);

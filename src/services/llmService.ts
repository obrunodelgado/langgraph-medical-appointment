import { ChatOpenAI } from "@langchain/openai";
import { config, type ModelConfig } from "../config.ts";
import { z } from 'zod/v3'
import { createAgent, HumanMessage, providerStrategy, SystemMessage } from "langchain";

export class LlmService {
    private config: ModelConfig
    private llmClient: ChatOpenAI

    constructor(configOverride?: ModelConfig) {
        this.config = configOverride ?? config

        this.llmClient = new ChatOpenAI({
            apiKey: this.config.apiKey,
            modelName: this.config.model,
            temperature: this.config.temperature,
            configuration: {
                baseURL: this.config.baseURL,
            }
        })
    }

    async generateStructured<T>(
        systemPrompt: string,
        userPrompt: string,
        schema: z.ZodSchema<T>
    ) {
        try {
            const agent = createAgent({
                model: this.llmClient,
                tools: [],
                responseFormat: providerStrategy(schema)
            })
            const messages = [
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt)
            ]
            const data = await agent.invoke({ messages })
            return {
                success: true,
                data: data.structuredResponse,
            }
        } catch (error) {
            console.error('Error LLMService', error)

            return {
                success: false,
                error: error instanceof Error ?
                    error.message :
                    String(error),
            }
        }
    }
}

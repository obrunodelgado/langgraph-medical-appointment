import { HumanMessage } from 'langchain';
import { buildGraph } from './graph/factory.ts';

import Fastify from 'fastify';

const graph = await buildGraph();

export const createServer = () => {
    const app = Fastify();

    app.post('/chat', {
        schema: {
            body: {
                type: 'object',
                required: ['question', 'threadId'],
                properties: {
                    question: { type: 'string', minLength: 10 },
                    threadId: { type: 'string', minLength: 1, maxLength: 200 },
                },
            }
        }
    }, async function (request, reply) {
        try {
            const { question, threadId: rawThreadId } = request.body as {
                question: string;
                threadId: string;
            };
            const threadId = rawThreadId.trim();

            if (!threadId) {
                return reply.status(400).send({ error: 'threadId must not be blank.' });
            }

            const response = await graph.invoke({
                messages: [new HumanMessage(question)],
            }, {
                configurable: { thread_id: threadId },
            });

            return response

        } catch (error) {
            console.error('❌ Error processing request:', error);
            return reply.status(500).send({
                error: 'An error occurred while processing your request.',
            });
        }
    });

    return app;
};

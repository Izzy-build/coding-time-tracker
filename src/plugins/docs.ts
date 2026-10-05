import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Coding Time Tracker API',
        version: '0.1.0',
        description: [
          'REST API for a CLI-based coding-time tracker with a public leaderboard.',
          '',
          '**How it fits together**',
          '1. A user signs in on the website (`POST /signin`, creates the account on first use) and receives a **website JWT**.',
          '2. With that JWT the website calls `GET /token/get` to obtain a **CLI token** (`ctt_...`), later `GET /token/update` to rotate it.',
          '3. The user runs `ourcli config <TOKEN>`. The CLI checks it with `GET /validate/{token}`.',
          '4. The CLI measures coding time itself and calls `POST /report` roughly every 5 minutes with the **new** seconds; the server adds them to the cumulative total.',
          '5. `GET /profile/{token}` returns the user\'s safe profile; `GET /leaderboard` ranks everyone by total seconds.',
          '',
          '**Two separate credentials**',
          '- *Website JWT* — `Authorization: Bearer <jwt>`, accepted only by `/token/{action}`.',
          '- *CLI token* — in the URL path (`/validate`, `/profile`) or JSON body (`/report`); never accepted as a JWT, and a JWT is never accepted as a CLI token.',
          '',
          '**Errors** use `{ "error": { "code": "...", "message": "..." } }` (the single exception is the failure body of `/validate/{token}`, see that endpoint).',
        ].join('\n'),
      },
      tags: [
        { name: 'Auth', description: 'Website sign-in / registration' },
        { name: 'CLI Token', description: 'Generate and rotate the CLI token (website JWT)' },
        { name: 'CLI', description: 'Endpoints used by the CLI (CLI token)' },
        { name: 'Leaderboard', description: 'Public rankings' },
      ],
      components: {
        securitySchemes: {
          webBearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Website JWT returned by `POST /api/v1/signin`.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
}

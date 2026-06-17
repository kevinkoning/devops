const express = require('express');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3008;

app.use(cors());
app.use(express.json());

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'PhotoPrestiges API',
    version: '1.0.0',
    description: 'Microservices API for PhotoPrestiges - Photo scavenger hunt application',
    contact: {
      name: 'API Support',
      email: 'support@photoprestiges.com'
    }
  },
  servers: [
    {
      url: 'http://localhost',
      description: 'Local development server'
    },
    {
      url: 'http://localhost/api',
      description: 'Via nginx gateway'
    }
  ],
  tags: [
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'Register', description: 'Registration and participation' },
    { name: 'Targets', description: 'Target management' },
    { name: 'Score', description: 'Score submission and ratings' },
    { name: 'Read', description: 'Data retrieval and leaderboard' },
    { name: 'Mail', description: 'Email services' },
    { name: 'Clock', description: 'Scheduled jobs' }
  ],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new user',
        description: 'Create a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  role: { type: 'string', default: 'participant', enum: ['participant', 'owner'] }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'User created successfully' },
          400: { description: 'Validation error' },
          409: { description: 'Email already exists' }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login user',
        description: 'Authenticate user and get JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/register/participate': {
      post: {
        tags: ['Register'],
        summary: 'Participate in target',
        description: 'Register user participation in a target',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetId', 'userId'],
                properties: {
                  targetId: { type: 'string', description: 'Target ID' },
                  userId: { type: 'string', description: 'User ID' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Participation successful' },
          400: { description: 'Already participated or target not found' }
        }
      }
    },
    '/targets': {
      get: {
        tags: ['Targets'],
        summary: 'Get all targets',
        description: 'Retrieve list of targets with optional filtering',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', default: 'active' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 } }
        ],
        responses: {
          200: { description: 'List of targets' }
        }
      },
      post: {
        tags: ['Targets'],
        summary: 'Create new target',
        description: 'Create a new photo target',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description', 'imageBase64', 'location'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  imageBase64: { type: 'string', description: 'Base64 encoded image' },
                  location: {
                    type: 'object',
                    properties: {
                      latitude: { type: 'number' },
                      longitude: { type: 'number' },
                      radiusMeters: { type: 'integer' }
                    }
                  },
                  deadline: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Target created' },
          400: { description: 'Validation error' }
        }
      }
    },
    '/targets/{id}': {
      get: {
        tags: ['Targets'],
        summary: 'Get target by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Target details' },
          404: { description: 'Target not found' }
        }
      }
    },
    '/score/submit': {
      post: {
        tags: ['Score'],
        summary: 'Submit photo for scoring',
        description: 'Submit a photo to be scored against a target',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['targetId', 'userId', 'imageBase64'],
                properties: {
                  targetId: { type: 'string' },
                  userId: { type: 'string' },
                  imageBase64: { type: 'string' },
                  imageId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Photo scored successfully' },
          400: { description: 'Validation or submission error' }
        }
      }
    },
    '/score/submission/{id}': {
      get: {
        tags: ['Score'],
        summary: 'Get submission by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Submission details' },
          404: { description: 'Submission not found' }
        }
      }
    },
    '/score/user/{userId}': {
      get: {
        tags: ['Score'],
        summary: 'Get user submissions',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'User submissions' }
        }
      }
    },
    '/score/rate/{id}': {
      post: {
        tags: ['Score'],
        summary: 'Rate submission',
        description: 'Add thumbs up or down to a submission',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'rating'],
                properties: {
                  userId: { type: 'string' },
                  rating: { type: 'string', enum: ['thumbsUp', 'thumbsDown'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Rating registered' },
          400: { description: 'Invalid rating' }
        }
      }
    },
    '/read/leaderboard': {
      get: {
        tags: ['Read'],
        summary: 'Get leaderboard',
        description: 'Retrieve global or target-specific leaderboard',
        parameters: [
          { name: 'targetId', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }
        ],
        responses: {
          200: { description: 'Leaderboard data' }
        }
      }
    },
    '/read/targets': {
      get: {
        tags: ['Read'],
        summary: 'Get targets (public)',
        description: 'Retrieve targets with optional filtering',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'skip', in: 'query', schema: { type: 'integer' } }
        ],
        responses: {
          200: { description: 'List of targets' }
        }
      }
    },
    '/read/target/{id}': {
      get: {
        tags: ['Read'],
        summary: 'Get target details with submissions',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Target with submissions' },
          404: { description: 'Target not found' }
        }
      }
    },
    '/read/stats': {
      get: {
        tags: ['Read'],
        summary: 'Get statistics',
        description: 'Get overall platform statistics',
        responses: {
          200: { description: 'Platform stats' }
        }
      }
    },
    '/read/user/{userId}': {
      get: {
        tags: ['Read'],
        summary: 'Get user profile',
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'User profile and stats' }
        }
      }
    },
    '/mail/send': {
      post: {
        tags: ['Mail'],
        summary: 'Send general email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'subject', 'html'],
                properties: {
                  to: { type: 'string', format: 'email' },
                  subject: { type: 'string' },
                  html: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Email queued' }
        }
      }
    },
    '/mail/welcome': {
      post: {
        tags: ['Mail'],
        summary: 'Send welcome email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Welcome email queued' }
        }
      }
    },
    '/mail/score': {
      post: {
        tags: ['Mail'],
        summary: 'Send score notification',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'targetTitle', 'score', 'finalScore', 'rank'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  targetTitle: { type: 'string' },
                  score: { type: 'number' },
                  finalScore: { type: 'number' },
                  rank: { type: 'integer' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Score email queued' }
        }
      }
    },
    '/clock/check-deadlines': {
      post: {
        tags: ['Clock'],
        summary: 'Check and process deadlines',
        description: 'Trigger deadline checking manually',
        responses: {
          200: { description: 'Deadlines processed' }
        }
      }
    },
    '/clock/determine-winners': {
      post: {
        tags: ['Clock'],
        summary: 'Determine winners',
        description: 'Process completed targets and determine winners',
        responses: {
          200: { description: 'Winners determined' }
        }
      }
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Check service health status',
        responses: {
          200: { description: 'Service is healthy' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get('/openapi.json', (req, res) => {
  res.json(openApiSpec);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'swagger-service' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
    console.log(`OpenAPI spec available at http://localhost:${PORT}/openapi.json`);
  });
}

module.exports = app;
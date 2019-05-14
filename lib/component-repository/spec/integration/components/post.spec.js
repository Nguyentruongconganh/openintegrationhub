const Server = require('../../../src/Server');
const request = require('supertest');
const { expect } = require('chai');
const Component = require('../../../src/models/Component');

describe('POST /components/:id', () => {
    let server;

    beforeEach(async () => {
        const config = {
            get(key) {
                return this[key];
            },
            MONGODB_URI: 'mongodb://localhost/test'
        };
        const logger = {
            info: () => {},
            debug: () => {},
            warn: () => {},
            error: () => {},
            trace: () => {}
        };
        const iam = {
            middleware(req, res, next) {
                req.user = {
                    sub: '123'
                };
                return next();
            },
            can() {
                return (req, res, next) => next()
            }
        };
        server = new Server({config, logger, iam});
        await server.start();

        await Component.deleteMany({});
    });

    afterEach(async () => {
        await server.stop();
    });

    it('should create a new component with default values', async () => {
        const { body, statusCode } = await request(server.getApp())
            .post('/components')
            .send({
                data: {
                    name: 'New name',
                    description: 'New description'
                }
            });

        delete body.data.id;
        delete body.data.createdAt;
        delete body.data.updatedAt;

        expect(body).to.deep.equal({
            data: {
                'name': 'New name',
                'description': 'New description',
                'access': 'private',
                'distribution': {
                    'type': 'docker'
                },
                'owners': [
                    {
                        'id': '123',
                        'type': 'user'
                    }
                ]
            },
            meta: {}
        });
        expect(statusCode).to.equal(201);
    });

    it('should create a new component with custom values', async () => {
        const { body, statusCode } = await request(server.getApp())
            .post('/components')
            .send({
                data: {
                    name: 'New name',
                    description: 'New description',
                    access: 'public',
                    distribution: {
                        type: 'docker',
                        image: 'openintegratiohub/email:latest'
                    },
                    owners: [
                        {
                            id: 'temp123',
                            type: 'custom-type'
                        }
                    ]
                }
            });

        delete body.data.id;
        delete body.data.createdAt;
        delete body.data.updatedAt;

        expect(body).to.deep.equal({
            data: {
                'name': 'New name',
                'description': 'New description',
                'access': 'public',
                'distribution': {
                    'type': 'docker',
                    'image': 'openintegratiohub/email:latest'
                },
                'owners': [
                    {
                        'id': 'temp123',
                        'type': 'custom-type'
                    },
                    {
                        'id': '123',
                        'type': 'user'
                    }
                ]
            },
            meta: {}
        });
        expect(statusCode).to.equal(201);
    });
});

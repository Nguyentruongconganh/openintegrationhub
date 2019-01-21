const express = require('express');
const pug = require('pug');
const path = require('path');
const Logger = require('@basaas/node-logger');

const router = express.Router();

const authMiddleware = require('../util/auth');
const CONF = require('./../conf');
const CONSTANTS = require('./../constants/index');
const TokenUtils = require('./../util/tokens');
const keystore = require('./../util/keystore');
const AccountDAO = require('../dao/accounts');

const logger = Logger.getLogger(`${CONF.general.loggingNameSpace}/general`, {
    level: 'debug',
});

router.get('/', (req, res) => {
    
    res
        .send(
            pug.renderFile(
                path.join(__dirname, '../views/home.pug'), {
                },
            ),
        );
});

router.get('/.well-known/jwks.json', async (req, res) => {

    const jwks = await keystore.getKeystoreAsJSON();

    if (CONF.jwt.algorithmType === CONSTANTS.JWT_ALGORITHMS.RSA) {
        return res.send(jwks);
    } else {
        return res.status(423).send({ message: 'RSA algorithm is not activated' });
    }

});

router.post('/login', authMiddleware.authenticate, authMiddleware.accountIsEnabled, async (req, res, next) => {

    if (!req.user) {
        return next({ status: 401, message: CONSTANTS.ERROR_CODES.NOT_LOGGED_IN });
    }

    // TODO: should normal users always receive a token? Is that token long living?
    const token = await TokenUtils.sign(req.user);
    req.headers.authorization = `Bearer ${token}`;
    res.status(200).send({ token });

});

router.get('/context', authMiddleware.validateAuthentication, async (req, res, next) => {

    try {
        const { memberships, currentContext } = await AccountDAO.findOne({ _id: req.user.userid });

        res.status(200).send({ memberships, currentContext });

    } catch (err) {
        logger.error(err);
        return next({ status: 500, message: CONSTANTS.ERROR_CODES.DEFAULT });
    }

});

router.post('/context', authMiddleware.validateAuthentication,
    async (req, res, next) => {

        const { tenant } = req.body;

        try {

            if (await AccountDAO.userHasContext({ userId: req.user.userid, tenantId: tenant })) {

                const { currentContext } = await AccountDAO.setCurrentContext({ userId: req.user.userid, tenantId: tenant });
                
                res.status(200).send({ currentContext });

            } else {
                res.sendStatus(403);
            }

        } catch (err) {
            logger.error(err);
            return next({ status: 500, message: CONSTANTS.ERROR_CODES.DEFAULT });
        }

    });

router.post('/logout', (req, res) => {
    req.logout();
    res.clearCookie(CONF.jwt.cookieName);
    res.send({ loggedOut: true });
});

module.exports = router;

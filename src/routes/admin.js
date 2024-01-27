const { query, validationResult } = require('express-validator')
const { sequelize } = require('../model')
const { QueryTypes } = require('sequelize')
const { Router } = require('express')
const { getBestClients, getBestProfession } = require('../db/queries')
const formatDate = require('../utils/formatDate')
const { getStatusCode, buildErrorPayload } = require('../utils/handleErrors')
const validateNumberIsPositive = require('../utils/validateNumberIsPositive')

const router = Router()
router.get(
    '/best-profession',
    [
        query('start')
            .isISO8601()
            .toDate()
            .withMessage('start must be a valid date'),
        query('end')
            .isISO8601()
            .toDate()
            .withMessage('end must be a valid date'),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        const { start, end } = req.query

        const startDate = formatDate(start)
        const endDate = formatDate(end)

        try {
            const [row] = await sequelize.query(getBestProfession, {
                replacements: { startDate, endDate },
                type: QueryTypes.SELECT,
            })

            res.send(row)
        } catch (e) {
            console.error(e)
            res.status(getStatusCode(e)).json(buildErrorPayload(e))
        }
    }
)

router.get(
    '/best-clients',
    [
        query('start')
            .isISO8601()
            .toDate()
            .withMessage('start must be a valid date'),
        query('end')
            .isISO8601()
            .toDate()
            .withMessage('end must be a valid date'),
        query('limit').optional().isInt().custom(validateNumberIsPositive),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        const { start, end } = req.query
        const limit = req.query.limit || 2

        const startDate = formatDate(start)
        const endDate = formatDate(end)

        try {
            const rows = await sequelize.query(getBestClients, {
                replacements: { startDate, endDate, limit },
                type: QueryTypes.SELECT,
            })

            res.send(rows)
        } catch (e) {
            console.error(e)
            res.status(getStatusCode(e)).json(buildErrorPayload(e))
        }
    }
)

module.exports = router

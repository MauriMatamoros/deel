const { getProfile } = require('../middleware/getProfile')
const { query, validationResult } = require('express-validator')
const { sequelize } = require('../model')
const { QueryTypes } = require('sequelize')
const { Router } = require('express')

const router = Router()
router.get(
    '/best-profession',
    getProfile,
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

        const startDate = new Date(start).toISOString().slice(0, 10)
        const endDate = new Date(end).toISOString().slice(0, 10)

        try {
            const [row] = await sequelize.query(
                `
            WITH jobs_with_contracts AS (
                SELECT *
                FROM Jobs
                JOIN Contracts
                ON Jobs.ContractId = Contracts.id
            )

            SELECT profession, SUM(jobs_with_contracts.price) AS total_earnings
            FROM Profiles
            JOIN jobs_with_contracts ON ContractorId = Profiles.id
            WHERE jobs_with_contracts.paid = 1
            AND jobs_with_contracts.paymentDate BETWEEN :startDate AND DATE(:endDate, '+1 day')
            GROUP BY profession
            ORDER BY total_earnings DESC
            LIMIT 1;
        `,
                {
                    replacements: { startDate, endDate },
                    type: QueryTypes.SELECT,
                }
            )

            res.send(row)
        } catch (e) {
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
    }
)

router.get(
    '/best-clients',
    getProfile,
    [
        query('start')
            .isISO8601()
            .toDate()
            .withMessage('start must be a valid date'),
        query('end')
            .isISO8601()
            .toDate()
            .withMessage('end must be a valid date'),
        query('limit').optional().isNumeric(),
    ],
    async (req, res) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        const { start, end } = req.query
        const limit = req.query.limit || 2

        const startDate = new Date(start).toISOString().slice(0, 10)
        const endDate = new Date(end).toISOString().slice(0, 10)

        try {
            const rows = await sequelize.query(
                `
                WITH jobs_with_contracts AS (
                    SELECT *
                    FROM Jobs
                    JOIN Contracts
                    ON Jobs.ContractId = Contracts.id
                )

                SELECT Profiles.id, firstName || ' ' || lastName AS fullName, jobs_with_contracts.price
                FROM Profiles
                JOIN jobs_with_contracts ON ClientId = Profiles.id
                WHERE jobs_with_contracts.paid = 1
                AND jobs_with_contracts.paymentDate BETWEEN :startDate AND DATE(:endDate, '+1 day')
                GROUP BY Profiles.id
                ORDER BY price DESC
                LIMIT :limit;
            `,
                {
                    replacements: { startDate, endDate, limit },
                    type: QueryTypes.SELECT,
                }
            )

            res.send(rows)
        } catch (e) {
            console.error(e)
            res.status('code' in e ? e.code : 500).json({
                errors: ['code' in e ? e.message : 'Internal Server Error.'],
            })
        }
    }
)

module.exports = router

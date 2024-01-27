const { getProfile } = require('../middleware/getProfile')
const { Op } = require('sequelize')
const { Router } = require('express')

const router = Router()
router.get('/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params
    try {
        const contract = await Contract.findOne({
            where: {
                id,
                [Op.or]: [
                    { ContractorId: req.profile.id },
                    { ClientId: req.profile.id },
                ],
            },
        })
        if (!contract) {
            const error = new Error('Contract not found.')
            error.code = 404
            throw error
        }
        res.json(contract)
    } catch (e) {
        console.error(e)
        res.status('code' in e ? e.code : 500).json({
            errors: ['code' in e ? e.message : 'Internal Server Error.'],
        })
    }
})

router.get('/', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models')
    try {
        const contracts = await Contract.findAll({
            where: {
                status: {
                    [Op.ne]: 'terminated',
                },
                [Op.or]: [
                    { ContractorId: req.profile.id },
                    { ClientId: req.profile.id },
                ],
            },
        })
        res.json(contracts)
    } catch (e) {
        console.error(e)
        res.status('code' in e ? e.code : 500).json({
            errors: ['code' in e ? e.message : 'Internal Server Error.'],
        })
    }
})

module.exports = router

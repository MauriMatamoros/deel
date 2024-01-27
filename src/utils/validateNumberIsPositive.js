module.exports = (value) => {
    if (value > 0) {
        return true
    }
    throw new Error('Must be a positive number')
}

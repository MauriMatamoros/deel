module.exports = {
    getBestClients: `
        SELECT * FROM (
            SELECT Profiles.id, firstName || ' ' || lastName AS fullName, Jobs.price
            FROM Profiles
            JOIN Contracts ON ClientId = Profiles.id
            JOIN Jobs ON Jobs.ContractId = Contracts.id
            WHERE Jobs.paid = 1 AND Jobs.paymentDate BETWEEN :startDate AND DATE(:endDate, '+1 day')
            GROUP BY Profiles.id
            LIMIT :limit
            ) AS price_by_profession
        ORDER BY price DESC;
    `,
    getBestProfession: `
        SELECT Profiles.profession, SUM(Jobs.price) AS total_earnings
        FROM Profiles
        JOIN Contracts ON Contracts.ContractorId = Profiles.id
        JOIN Jobs ON Contracts.id = Jobs.ContractId
        WHERE Jobs.paid = 1 AND Jobs.paymentDate BETWEEN :startDate AND DATE(:endDate, '+1 day')
        GROUP BY Profiles.profession
        ORDER BY total_earnings DESC
        LIMIT 1;
    `,
    getMaxDepositAllowed: `
        SELECT sum(price) * .25 AS "maxDepositAllowed"
        FROM Jobs
        JOIN Contracts
        ON Jobs.ContractId = Contracts.id
        WHERE status <> 'terminated' 
        AND paid IS NULL 
        AND ClientId = :id;
    `,
}

import { DateTime } from 'luxon';
import { statementOps } from '../actual';

describe('statementOps', () => {
    const cardPaymentDayOfMonth = 10;
    const expectedStatementDates = [
        {
            startDate: DateTime.fromISO('2025-11-16'),
            closeDate: DateTime.fromISO('2025-12-16'),
            paymentDate: DateTime.fromISO('2026-01-10'),
        },
        {
            startDate: DateTime.fromISO('2025-12-17'),
            closeDate: DateTime.fromISO('2026-01-16'),
            paymentDate: DateTime.fromISO('2026-02-10'),
        },
        {
            startDate: DateTime.fromISO('2026-01-17'),
            closeDate: DateTime.fromISO('2026-02-13'),
            paymentDate: DateTime.fromISO('2026-03-10'),
        },
        {
            startDate: DateTime.fromISO('2026-02-14'),
            closeDate: DateTime.fromISO('2026-03-16'),
            paymentDate: DateTime.fromISO('2026-04-10'),
        },
    ];

    describe('getStartDate', () => {
        it('should correctly calculate startDate from closeDate', () => {
            expectedStatementDates.forEach(({ startDate, closeDate }) => {
                const result = statementOps.getStartDate(closeDate);
                expect(result).toEqual(startDate);
            });
        });
    });

    describe('getCloseDate', () => {
        it('should correctly calculate closeDate from startDate', () => {
            expectedStatementDates.forEach(({startDate, closeDate}) => {
                const result = statementOps.getCloseDate(startDate);
                expect(result).toEqual(closeDate);
            });
        });
    });

    describe('getPaymentDate', () => {
        it('should correctly calculate paymentDate from closeDate', () => {
            expectedStatementDates.forEach(({closeDate, paymentDate}) => {
                const result = statementOps.getPaymentDate(closeDate, cardPaymentDayOfMonth);
                expect(result).toEqual(paymentDate);
            });
        });
    });
});

import * as api from "@actual-app/api";
import {APIAccountEntity, APIScheduleEntity} from "@actual-app/api/@types/loot-core/src/server/api-models";
import {ensureEmptyDirectory} from "./files";
import _ from 'lodash';
import {DateTime} from 'luxon';
import {TransactionEntity} from "@actual-app/api/@types/loot-core/src/types/models";
import {ActualConfig} from "../commands/actual";

interface CreditCardScheduleEntity extends APIScheduleEntity {
    name: string;
    statement: {
        startDate: DateTime;
        closeDate: DateTime;
    }
}

interface CreditCardInfo {
    accountId: string;
}

const DATETIME_FORMAT = 'yyyy-MM-dd';

const CREDIT_CARD_ACCOUNTS = {
    'Venture X': {
        accountId: '36e96ed9-5919-4975-a383-0accb2e5c7a5',
    } as CreditCardInfo,
    'Savor': {
        accountId: 'c5d0a611-d1ab-4128-a407-5deec416b737',
    } as CreditCardInfo,
} as const;

const MONTHS_PLUS_1 = [1, 3, 5, 7, 8, 10, 12];

const withApi = async <A>({ dataDir, serverURL, password, syncID }: ActualConfig, op: () => Promise<A>): Promise<A> => {
    await ensureEmptyDirectory(dataDir);
    await api.init({ dataDir, serverURL, password });
    await api.downloadBudget(syncID, { password: password });

    try {
        return await op();
    } finally {
        console.log('Shutting down API');
        await api.shutdown();
    }
}

const actualScheduleToCreditCardSchedule = (actualSchedule: APIScheduleEntity): CreditCardScheduleEntity | undefined => {
    const [name, statementCloseDateStr] = actualSchedule.name?.split(' - ') ?? [];

    if (!statementCloseDateStr) return undefined;

    const closeDate = DateTime.fromFormat(statementCloseDateStr, DATETIME_FORMAT);

    if (!closeDate) return undefined;

    const startDate = closeDate.minus({ days: closeDate.month in MONTHS_PLUS_1 ? 30 : 29 });

    return {
        ...actualSchedule,
        name: actualSchedule.name!,
        statement: { startDate, closeDate },
    };
};

const getExistingCreditCardSchedule = (creditCardName: string, existingSchedules: APIScheduleEntity[]): CreditCardScheduleEntity[] => {
    const filteredSchedules = existingSchedules
        .filter((s) => s.name?.startsWith(`${creditCardName} - `) ?? false);

    const sortedSchedules = _.sortBy(filteredSchedules, (s) => s.name);

    return sortedSchedules.map((s, index): CreditCardScheduleEntity => {
        const nameParts = s.name!.split(' - ');
        const closeDate = DateTime.fromFormat(nameParts[1], DATETIME_FORMAT);

        const previous = index === 0 ? undefined : sortedSchedules[index - 1];

        if (!previous)
            return { ...s, name: s.name!, statement: { startDate: closeDate.minus({ days: 30 }), closeDate } }

        const previousNameParts = previous.name!.split(' - ');
        const previousCloseDate = DateTime.fromFormat(previousNameParts[1], DATETIME_FORMAT);
        const startDate = previousCloseDate.plus({ days: 1 });

        return { ...s, name: s.name!, statement: { startDate, closeDate } }
    });
};

const getOrCreateNextStatementSchedule = async (today: DateTime, creditCardName: string, creditCardInfo: CreditCardInfo, existingSchedules: APIScheduleEntity[]): Promise<CreditCardScheduleEntity> => {
    const existingCreditCardSchedules = getExistingCreditCardSchedule(creditCardName, existingSchedules);

    const targetSchedule = existingCreditCardSchedules.find((s) => s.statement.closeDate >= today);

    if (targetSchedule) {
        console.log(`Found current schedule`);
        return targetSchedule;
    }

    let nextClosingDate = _.last(existingCreditCardSchedules)!.statement.closeDate;

    // in case our latest schedule is old, we'll need this loop to continue calculating the closing date
    while (nextClosingDate <= today) {
        nextClosingDate = nextClosingDate.plus({ days: 30 });
    }

    // Capital One's payment date is 25 days after closing date
    const paymentDate = nextClosingDate.plus({ days: 25 });

    const newName = `${creditCardName} - ${nextClosingDate.toFormat(DATETIME_FORMAT)}`;

    console.log(`No existing schedule found, creating a new one... (${newName})`);

    const scheduleId = await api.createSchedule({
        name: newName,
        date: paymentDate.toFormat(DATETIME_FORMAT),
        amount: 0,
        amountOp: 'isapprox',
        account: creditCardInfo.accountId,
    });

    const allSchedules: APIScheduleEntity[] = await api.getSchedules();
    const newSchedule = _.find(allSchedules, (s) => s.id === scheduleId);

    if (!newSchedule)
        throw new Error("Failed to create a new schedule!");

    const possibleStartDate = _.last(existingCreditCardSchedules)!.statement.closeDate.plus({ days: 1 });

    const startDate = nextClosingDate.diff(possibleStartDate, 'days').days > 31 ? nextClosingDate.minus({ days: 30 }) : possibleStartDate;

    return {
        ...newSchedule,
        name: newSchedule.name!,
        statement: {
            startDate,
            closeDate: nextClosingDate,
        }
    };
};

const sumCompletedTransactionsBetween = async (accountId: string, startDate: DateTime, endDate: DateTime): Promise<number> => {
    const transactions: TransactionEntity[] = await api.getTransactions(accountId, startDate.toFormat(DATETIME_FORMAT), endDate.toFormat(DATETIME_FORMAT));

    const cleanedTransactions =  _.sortBy(transactions.filter((t) => t.cleared), (t) => t.date);

    return cleanedTransactions.reduce((sum, t) => {
        // only sum negative transactions
        if (t.amount < 0) {
            const newSum = sum + t.amount;

            console.log(`Summing transaction '${t.date} - ${t.notes}: ${t.amount}' (${newSum / 100})`)

            return newSum;
        }

        console.log(`Ignoring transaction '${t.date} - ${t.notes}: ${t.amount}'`)

        return sum;
    }, 0);
};

export const banksync = async (config: ActualConfig): Promise<void> => {
    await withApi(config, async () => {
        const accounts: APIAccountEntity[] = await api.getAccounts();
        await Promise.all(accounts.map((a) => api.runBankSync({ accountId: a.id })));
    });
}

export const updateCreditCardSchedules = async (config: ActualConfig): Promise<void> => {
    await withApi(config, async () => {
        const today = DateTime.now().startOf('day');

        const existingSchedules: APIScheduleEntity[] = await api.getSchedules();

        for (const name in CREDIT_CARD_ACCOUNTS) {
            try {
                console.log(`Working on card '${name}'...`);

                const creditCardInfo = CREDIT_CARD_ACCOUNTS[name as keyof typeof CREDIT_CARD_ACCOUNTS];

                const statementSchedule = await getOrCreateNextStatementSchedule(today, name, creditCardInfo, existingSchedules);

                console.log(`Working on updating schedule '${statementSchedule.name}'...`);

                const totalAmount = await sumCompletedTransactionsBetween(creditCardInfo.accountId, statementSchedule.statement.startDate, statementSchedule.statement.closeDate);

                console.log(`Calculated total amount between ${statementSchedule.statement.startDate.toFormat(DATETIME_FORMAT)} and ${statementSchedule.statement.closeDate.toFormat(DATETIME_FORMAT)}: ${totalAmount}`);

                await api.updateSchedule(statementSchedule.id, { amount: totalAmount });

                console.log(`Successfully updated schedule '${statementSchedule.name}'!`);

                // if we are within 5 days of statement start, try to go back and update previous statement's transactions
                if (statementSchedule.statement.startDate.plus({ days: 5 }) >= today) {
                    const targetClosingDate = statementSchedule.statement.startDate.minus({ days: 1 });

                    console.log(`Updating previous statement schedule with a closing date of ${targetClosingDate.toFormat(DATETIME_FORMAT)}...`);

                    const allSchedules = getExistingCreditCardSchedule(name, existingSchedules);
                    const previousStatementSchedule = allSchedules.find((s) => s.statement.closeDate.equals(targetClosingDate));

                    if (!previousStatementSchedule) {
                        console.log(`No previous statement schedule found with closing date of '${targetClosingDate.toFormat(DATETIME_FORMAT)}'`);
                        return;
                    }

                    const previousTotalAmount = await sumCompletedTransactionsBetween(creditCardInfo.accountId, previousStatementSchedule.statement.startDate, previousStatementSchedule.statement.closeDate);

                    if (previousTotalAmount !== previousStatementSchedule.amount) {
                        console.log(`Previous statement schedule '${previousStatementSchedule.name}' has a different amount, updating...`);
                        await api.updateSchedule(previousStatementSchedule.id, { amount: previousTotalAmount });
                    } else {
                        console.log(`Previous statement schedule '${previousStatementSchedule.name}' has the same amount, skipping update...`);
                    }

                }
            } catch (e) {
                console.error(`Failed to update schedule for card '${name}'!`, e);
            }
        }
    });
};

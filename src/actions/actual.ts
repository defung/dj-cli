import * as api from "@actual-app/api";
import {APIAccountEntity, APIScheduleEntity} from "@actual-app/api/@types/loot-core/src/server/api-models";
import {ensureEmptyDirectory} from "./files";
import _ from 'lodash';
import {DateTime} from 'luxon';
import {TransactionEntity} from "@actual-app/api/@types/loot-core/src/types/models";
import {getInfisicalSecrets} from "./infisical";
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

    const startDate = closeDate.minus({ days: 30 });

    return {
        ...actualSchedule,
        name: actualSchedule.name!,
        statement: { startDate, closeDate },
    };
};

const getOrCreateNextStatementSchedule = async (today: DateTime, creditCardName: string, creditCardInfo: CreditCardInfo, existingSchedules: APIScheduleEntity[]): Promise<CreditCardScheduleEntity> => {
    const unsortedExistingCreditCardSchedules = existingSchedules
        .filter((s) => s.name?.startsWith(`${creditCardName} - `))
        .map((s) => actualScheduleToCreditCardSchedule(s)!);

    const existingCreditCardSchedules = _.sortBy(unsortedExistingCreditCardSchedules, (s) => s.statement.closeDate);

    const targetSchedule = existingCreditCardSchedules.find((s) => s.statement.closeDate >= today);

    if (targetSchedule) return targetSchedule;

    // Capital One's closing date is 30 days after previous closing date
    let nextClosingDate = _.last(existingCreditCardSchedules)!.statement.closeDate;

    // in case our latest schedule is old, we'll need this loop to continue calculating the closing date
    while (nextClosingDate <= today) {
        nextClosingDate = nextClosingDate.plus({ days: 30 });
    }

    // Capital One's payment date is 25 days after closing date
    const paymentDate = nextClosingDate.plus({ days: 25 });

    const scheduleId = await api.createSchedule({
        name: `${creditCardName} - ${nextClosingDate.toFormat(DATETIME_FORMAT)}`,
        date: paymentDate.toFormat(DATETIME_FORMAT),
        amount: 0,
        amountOp: 'isapprox',
        account: creditCardInfo.accountId,
    });

    const allSchedules: APIScheduleEntity[] = await api.getSchedules();
    const newSchedule = _.find(allSchedules, (s) => s.id === scheduleId);

    if (!newSchedule)
        throw new Error("Failed to create a new schedule!");

    const newCreditCardSchedule = actualScheduleToCreditCardSchedule(newSchedule);

    if (!newCreditCardSchedule)
        throw new Error("Failed to parse a new schedule!");

    return newCreditCardSchedule;
};

const getCompletedTransactionsBetween = async (accountId: string, startDate: DateTime, endDate: DateTime): Promise<TransactionEntity[]> => {
    const transactions: TransactionEntity[] = await api.getTransactions(accountId, startDate.toFormat(DATETIME_FORMAT), endDate.toFormat(DATETIME_FORMAT));

    return _.sortBy(transactions.filter((t) => t.cleared), (t) => t.date);
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

                const currentStatementTransactions = await getCompletedTransactionsBetween(creditCardInfo.accountId, statementSchedule.statement.startDate, statementSchedule.statement.closeDate);

                // only sum negative transactions
                const totalAmount = currentStatementTransactions.reduce((sum, t) => {
                    if (t.amount < 0) {
                        const newSum = sum + t.amount;
                        console.log(`Summing transaction '${t.date} - ${t.notes}: ${t.amount}' (${newSum / 100})`)
                        return newSum;
                    }

                    console.log(`Ignoring transaction '${t.date} - ${t.notes}: ${t.amount}'`)

                    return sum;
                }, 0);

                console.log(`Calculated total amount between ${statementSchedule.statement.startDate.toFormat(DATETIME_FORMAT)} and ${statementSchedule.statement.closeDate.toFormat(DATETIME_FORMAT)}: ${totalAmount}`);

                await api.updateSchedule(statementSchedule.id, { amount: totalAmount });

                console.log(`Successfully updated schedule '${statementSchedule.name}'!`);
            } catch (e) {
                console.error(`Failed to update schedule for card '${name}'!`, e);
            }
        }
    });
};

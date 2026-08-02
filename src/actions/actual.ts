import * as actualApi from "@actual-app/api";

import {ensureEmptyDirectory} from "./files";
import _ from 'lodash';
import {DateTime} from 'luxon';
import {ActualConfig} from "../commands/actual";

type ActualApi = typeof actualApi;

type APIAccountEntity = Awaited<ReturnType<typeof actualApi.getAccounts>>[number];
type APIPayeeEntity = Awaited<ReturnType<typeof actualApi.getPayees>>[number];
type APIScheduleEntity = Awaited<ReturnType<typeof actualApi.getSchedules>>[number];
type TransactionEntity = Awaited<ReturnType<typeof actualApi.getTransactions>>[number];


type Flatten<T> = { [K in keyof T]: T[K] } & {};

type CreditCardScheduleEntity = Flatten<APIScheduleEntity & {
    name: string;
    statement: {
        startDate: DateTime;
        closeDate: DateTime;
    }
}>

type CreateCreditCardScheduleEntity = Omit<CreditCardScheduleEntity, 'id' | 'posts_transaction' | 'amount' | 'amountOp'>;

type CreditCardInfo = {
    accountId: string;
    paymentDayOfMonth: number;
}

const CREDIT_CARD_ACCOUNTS = {
    'Venture X': {
        accountId: '36e96ed9-5919-4975-a383-0accb2e5c7a5',
        paymentDayOfMonth: 10,
    },
    'Savor': {
        accountId: 'c5d0a611-d1ab-4128-a407-5deec416b737',
        paymentDayOfMonth: 19,
    },
} as const satisfies Record<string, CreditCardInfo>;

const BANK_ACCOUNT_ID = '7f94ae8a-4acc-44f6-9cc3-c25197eaf04b';
const PAYEE_NAME = 'Capital One Credit Card Payment';

const DATETIME_FORMAT = 'yyyy-MM-dd';

const withApi = async <A>({ dataDir, serverURL, password, syncID }: ActualConfig, op: (api: ActualApi) => Promise<A>): Promise<A> => {
    await ensureEmptyDirectory(dataDir);
    await actualApi.init({ dataDir, serverURL, password });
    await actualApi.downloadBudget(syncID, { password: password });

    try {
        return await op(actualApi);
    } finally {
        console.log('Shutting down API');
        await actualApi.shutdown();
    }
}

// this is valid for CapitalOne
export const statementOps = {
    getStartDate: (closeDate: DateTime): DateTime => {
        const daysToSubtract = closeDate.daysInMonth! - 1;
        return closeDate.minus({ days: daysToSubtract });
    },
    getCloseDate: (startDate: DateTime): DateTime => {
        const daysToAdd = startDate.set({ month: startDate.month + 1, day: 1 }).daysInMonth! - 1;
        return startDate.plus({ days: daysToAdd });
    },
    getPaymentDate: (closeDate: DateTime, cardPaymentDayOfMonth: number): DateTime => {
        const nextMonth = closeDate.plus({ months: 1 });
        const targetDay = Math.min(cardPaymentDayOfMonth, nextMonth.daysInMonth!);
        return nextMonth.set({ day: targetDay });
    }
}

const toCreditCardScheduleEntity = (schedule: APIScheduleEntity): CreditCardScheduleEntity => {
    if (!schedule.name) {
        throw new Error(`Missing schedule name for id '${schedule.id}'!`);
    }

    const nameParts = schedule.name.split(' - ');
    const closeDate = DateTime.fromFormat(nameParts[1], DATETIME_FORMAT);

    if (!closeDate.isValid) {
        throw new Error(`Invalid close date '${nameParts[1]}': ${closeDate.invalidExplanation}`);
    }

    const startDate = statementOps.getStartDate(closeDate);

    return { ...schedule, name: schedule.name!, statement: { startDate, closeDate } };
};

const createSchedule = async (api: ActualApi, payeeName: string, bankAccountId: string, creditCardSchedule: CreateCreditCardScheduleEntity): Promise<CreditCardScheduleEntity> => {
    const payees: APIPayeeEntity[] = await api.getPayees();
    const payee = _.find(payees, (p) => p.name === payeeName);

    if (!payee) {
        throw new Error(`Failed to find payee with name '${payeeName}'!`);
    }

    const scheduleId = await api.createSchedule({
        name: creditCardSchedule.name,
        date: creditCardSchedule.date,
        amount: 0,
        amountOp: 'isapprox',
        account: bankAccountId,
        payee: payee.id,
        posts_transaction: false,
    });

    const newSchedules: APIScheduleEntity[] = await api.getSchedules();
    const newSchedule = _.find(newSchedules, (s) => s.id === scheduleId);

    if (!newSchedule)
        throw new Error("Failed to create a new schedule!");

    return toCreditCardScheduleEntity(newSchedule);
};

const getSortedExistingCreditCardSchedule = (creditCardName: string, existingSchedules: APIScheduleEntity[]): CreditCardScheduleEntity[] => {
    const filteredSchedules = existingSchedules
        .filter((s) => s.name?.startsWith(`${creditCardName} - `) ?? false);

    const sortedSchedules = _.sortBy(filteredSchedules, (s) => s.name);

    return sortedSchedules.map(toCreditCardScheduleEntity);
};

const getOrCreateNextStatementSchedule = async (api: ActualApi, today: DateTime, creditCardName: string, creditCardInfo: CreditCardInfo, existingSchedules: APIScheduleEntity[]): Promise<CreditCardScheduleEntity> => {
    const existingCreditCardSchedules: CreditCardScheduleEntity[] = getSortedExistingCreditCardSchedule(creditCardName, existingSchedules);

    const targetSchedule = existingCreditCardSchedules.find((s) => s.statement.closeDate >= today);

    if (targetSchedule) {
        console.log(`Found current schedule`);
        return targetSchedule;
    }

    let candidateNextStatement = _.last(existingCreditCardSchedules)!.statement;

    // in case our latest schedule is old, we'll need this loop to continue calculating the closing date
    while (candidateNextStatement.closeDate < today) {
        const nextStartDate = candidateNextStatement.closeDate.plus({ day: 1 });
        const nextCloseDate = statementOps.getCloseDate(nextStartDate);
        candidateNextStatement = {
            startDate: nextStartDate,
            closeDate: nextCloseDate,
        };
    }

    const paymentDate = statementOps.getPaymentDate(candidateNextStatement.closeDate, creditCardInfo.paymentDayOfMonth);

    const creditCardSchedule: CreateCreditCardScheduleEntity = {
        name: `${creditCardName} - ${candidateNextStatement.closeDate.toFormat(DATETIME_FORMAT)}`,
        statement: candidateNextStatement,
        date: paymentDate.toFormat(DATETIME_FORMAT),
    };

    console.log(`No existing schedule found, creating a new one... (${creditCardSchedule.name})`);

    return await createSchedule(api, PAYEE_NAME, BANK_ACCOUNT_ID, creditCardSchedule);
};

// both dates are inclusive (to match actual's getTransactions function)
const sumCompletedTransactionsBetween = async (api: ActualApi, accountId: string, startDate: DateTime, closeDate: DateTime): Promise<number> => {
    const transactions: TransactionEntity[] = await api.getTransactions(accountId, startDate.toFormat(DATETIME_FORMAT), closeDate.toFormat(DATETIME_FORMAT));

    const completedTransactions =  _.sortBy(transactions.filter((t) => !!t.cleared), (t) => t.date);

    return completedTransactions.reduce((sum, t) => {
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
    await withApi(config, async (api: ActualApi) => {
        const accounts: APIAccountEntity[] = await api.getAccounts();
        await Promise.all(accounts.map((a) => api.runBankSync({ accountId: a.id })));
    });
}

export const updateCreditCardSchedules = async (config: ActualConfig): Promise<void> => {
    await withApi(config, async (api: ActualApi) => {
        const today = DateTime.now().startOf('day');

        const existingSchedules: APIScheduleEntity[] = await api.getSchedules();

        for (const name in CREDIT_CARD_ACCOUNTS) {
            try {
                console.log(`Working on card '${name}'...`);

                const creditCardInfo = CREDIT_CARD_ACCOUNTS[name as keyof typeof CREDIT_CARD_ACCOUNTS];

                const statementSchedule: CreditCardScheduleEntity = await getOrCreateNextStatementSchedule(api, today, name, creditCardInfo, existingSchedules);

                console.log(`Working on updating schedule '${statementSchedule.name}'...`);

                const totalAmount = await sumCompletedTransactionsBetween(api, creditCardInfo.accountId, statementSchedule.statement.startDate, statementSchedule.statement.closeDate);

                console.log(`Calculated total amount between ${statementSchedule.statement.startDate.toFormat(DATETIME_FORMAT)} and ${statementSchedule.statement.closeDate.toFormat(DATETIME_FORMAT)}: ${totalAmount}`);

                await api.updateSchedule(statementSchedule.id, { amount: totalAmount });

                console.log(`Successfully updated schedule '${statementSchedule.name}'!`);

                // if we are within 2 days of statement start, try to go back and update previous statement's transactions
                if (statementSchedule.statement.startDate.plus({ days: 2 }) >= today) {
                    const targetClosingDate = statementSchedule.statement.startDate.minus({ days: 1 });

                    console.log(`Updating previous statement schedule with a closing date of ${targetClosingDate.toFormat(DATETIME_FORMAT)}...`);

                    const allSchedules = getSortedExistingCreditCardSchedule(name, existingSchedules);
                    const previousStatementSchedule = allSchedules.find((s) => s.statement.closeDate.equals(targetClosingDate));

                    if (!previousStatementSchedule) {
                        console.log(`No previous statement schedule found with closing date of '${targetClosingDate.toFormat(DATETIME_FORMAT)}'`);
                        return;
                    }

                    const previousTotalAmount = await sumCompletedTransactionsBetween(api, creditCardInfo.accountId, previousStatementSchedule.statement.startDate, previousStatementSchedule.statement.closeDate);

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

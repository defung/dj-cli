import type {
  AccountEntity,
  PayeeEntity,
  ScheduleEntity,
} from '../server';

export type APIAccountEntity = Pick<AccountEntity, 'id' | 'name'> & {
  offbudget?: boolean;
  closed?: boolean;
  balance_current?: number | null;
};

export type APIPayeeEntity = Pick<PayeeEntity, 'id' | 'name' | 'transfer_acct'>;

export type AmountOPType = 'is' | 'isapprox' | 'isbetween';

export type APIScheduleEntity = Pick<
  ScheduleEntity,
  'id' | 'name' | 'posts_transaction'
> & {
  rule?: ScheduleEntity['rule']; //All schedules has an associated underlying rule. not to be supplied iwth a new schedule
  next_date?: ScheduleEntity['next_date']; //Next occurence of a schedule. not to be supplied iwth a new schedule
  completed?: ScheduleEntity['completed']; //not to be supplied with a new schedule
  payee?: ScheduleEntity['_payee']; // Optional will default to null
  account?: ScheduleEntity['_account']; // Optional will default to null
  amount?: ScheduleEntity['_amount']; // Provide only 1 number except if the Amount
  amountOp: AmountOPType; // 'is' | 'isapprox' | 'isbetween'
  date: ScheduleEntity['_date']; // mandatory field in creating a schedule Mandatory field in creation
};

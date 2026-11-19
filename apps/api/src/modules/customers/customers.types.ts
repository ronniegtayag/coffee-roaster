/** What orders needs to know about a branch and its customer. */
export interface OrderingBranch {
  branchId: string;
  branchName: string;
  branchIsActive: boolean;
  customerId: string;
  customerDisplayName: string;
  customerIsActive: boolean;
}

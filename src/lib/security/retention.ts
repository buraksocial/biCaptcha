/** No default is a privacy decision: the operator must select a policy. */
export function retentionDays(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,3}$/.test(value) || Number(value) > 3650) throw Error('Explicit retention days required (1..3650)');
  return Number(value);
}

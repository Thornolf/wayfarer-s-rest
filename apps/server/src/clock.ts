/** The clock of the server, passed in so that tests can move it. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

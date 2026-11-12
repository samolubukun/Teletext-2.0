import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Pages fed by a Google Sheet or a feed are refreshed about every 15 minutes.
crons.interval("sync data sources", { minutes: 15 }, internal.dataSources.syncDue, {});
export default crons;

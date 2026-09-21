import { promises as fs } from 'fs';
import { SyncReport } from './types';

export async function writeReport(report: SyncReport, path: string | null): Promise<void> {
    if (!path) return;
    await fs.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
}

export function printSummary(report: SyncReport): void {
    const m = report.model;
    const cueCounts = countCues(report);

    console.log('\n=== SRT Sync Summary ===');
    console.log(`Fitted model: ref_time = ${m.a.toFixed(6)} * target_time + ${(m.b / 1000).toFixed(3)}s`);
    console.log(`Mode: ${m.mode}, inliers: ${m.inliers}/${m.total}, residual: ${m.residualMs.toFixed(1)}ms`);
    console.log(`Matched cues: ${cueCounts.matched}/${cueCounts.total} (${cueCounts.matchedPct.toFixed(1)}%)`);
    console.log('\nCounts:');
    console.log(`  1:1              ${report.counts['1:1']}`);
    console.log(`  1:N              ${report.counts['1:N']}`);
    console.log(`  M:1              ${report.counts['M:1']}`);
    console.log(`  M:N              ${report.counts['M:N']}`);
    console.log(`  interpolated     ${report.counts.unmatchedInterpolated}`);
    console.log(`  extrapolated     ${report.counts.unmatchedExtrapolated}`);
    console.log(`  demoted          ${report.counts.demoted}`);
    console.log(`  dropped          ${report.counts.dropped}`);
    console.log(`  overlaps         ${report.counts.overlaps}`);

    if (cueCounts.matchedPct < 50) {
        console.log('\n⚠️  Warning: fewer than half of the cues matched cleanly.');
        console.log('   The reference and target may be different cuts, or the timing may vary by scene.');
        console.log('   Review the output carefully; consider using --report to inspect low-confidence spots.');
    } else if (cueCounts.unresolvedPct > 30) {
        console.log('\n⚠️  Warning: many cues were interpolated or demoted.');
        console.log('   The timing fit may not be reliable across the whole file.');
    }

    if (report.dropped.length > 0) {
        console.log(`\nDropped ${report.dropped.length} cue(s) due to negative times.`);
    }

    if (report.overlaps.length > 0) {
        console.log(`\nDetected ${report.overlaps.length} overlap(s).`);
    }
}

function countCues(report: SyncReport): {
    matched: number;
    unresolved: number;
    total: number;
    matchedPct: number;
    unresolvedPct: number;
} {
    let matched = 0;
    let unresolved = 0;
    for (const g of report.groups) {
        const n = g.targetIdx.length;
        if (g.type === 'unmatched') {
            unresolved += n;
        } else {
            matched += n;
        }
    }
    unresolved += report.dropped.length;
    const total = matched + unresolved;
    return {
        matched,
        unresolved,
        total,
        matchedPct: total > 0 ? (matched / total) * 100 : 0,
        unresolvedPct: total > 0 ? (unresolved / total) * 100 : 0,
    };
}

export function strictThresholdExceeded(report: SyncReport, threshold = 0.2): boolean {
    const unresolved =
        report.counts.unmatchedInterpolated +
        report.counts.unmatchedExtrapolated +
        report.counts.demoted +
        report.counts.dropped;
    const total =
        report.counts['1:1'] +
        report.counts['1:N'] +
        report.counts['M:1'] +
        report.counts['M:N'] +
        unresolved;
    return total > 0 && unresolved / total > threshold;
}

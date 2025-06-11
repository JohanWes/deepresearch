#!/usr/bin/env node

/**
 * Run All Test Suites
 * Runs both mobile carousel and multi-LLM tests
 */

import { spawn } from 'child_process';

async function runTest(testFile, testName) {
    console.log(`\n🧪 Running ${testName}...\n`);
    
    return new Promise((resolve, reject) => {
        const child = spawn('node', [testFile], { 
            stdio: 'inherit',
            cwd: '/home/westerjo/repos/deepresearch'
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`\n✅ ${testName} completed successfully\n`);
                resolve();
            } else {
                console.log(`\n❌ ${testName} failed with code ${code}\n`);
                reject(new Error(`${testName} failed`));
            }
        });
    });
}

async function runAllTests() {
    console.log('🚀 Running Deep Research Complete Test Suite\n');
    console.log('============================================================');
    
    try {
        await runTest('tests/mobile-carousel.test.js', 'Mobile Carousel Touch Tests');
        await runTest('tests/multi-llm.test.js', 'Multi-LLM Feature Tests');
        
        console.log('============================================================');
        console.log('🎉 All test suites completed successfully!');
        
    } catch (error) {
        console.log('============================================================');
        console.log('❌ Some test suites failed. Please review the results above.');
        process.exit(1);
    }
}

runAllTests().catch(console.error);
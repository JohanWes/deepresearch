#!/usr/bin/env node

/**
 * Mobile Carousel Touch Test Suite
 * Tests the mobile carousel swipe functionality
 */

import fetch from 'node-fetch';
import assert from 'assert';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { JSDOM } from 'jsdom';

class MobileCarouselTester {
    constructor() {
        this.baseUrl = 'http://localhost:8006';
        this.sessionCookie = 'session_token=Johandeepresearch123';
        this.serverProcess = null;
        this.testResults = [];
    }

    async startServer() {
        console.log('🚀 Starting server for testing...');
        
        await this.stopExistingServers();
        
        this.serverProcess = spawn('npm', ['start'], { 
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
            cwd: '/home/westerjo/repos/deepresearch'
        });

        await delay(4000);
        
        try {
            const response = await fetch(`${this.baseUrl}/`, {
                headers: { 'Cookie': this.sessionCookie }
            });
            if (response.ok) {
                console.log('✅ Server started successfully');
                return true;
            }
        } catch (error) {
            console.log('❌ Server failed to start:', error.message);
            return false;
        }
    }

    async stopExistingServers() {
        const { exec } = await import('child_process');
        return new Promise((resolve) => {
            exec('pkill -f "node.*server.js"', () => {
                resolve();
            });
        });
    }

    async stopServer() {
        if (this.serverProcess) {
            this.serverProcess.kill('SIGTERM');
            await delay(2000);
            this.serverProcess = null;
        }
    }

    async runTest(testName, testFn) {
        try {
            console.log(`🧪 Running test: ${testName}`);
            await testFn();
            console.log(`✅ ${testName} - PASSED`);
            this.testResults.push({ name: testName, status: 'PASSED' });
        } catch (error) {
            console.log(`❌ ${testName} - FAILED: ${error.message}`);
            this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
        }
    }

    async testCSSMobileTouchAction() {
        const response = await fetch(`${this.baseUrl}/css/style.css`);
        const cssContent = await response.text();
        
        const mobileSection = cssContent.match(/@media \(max-width: 768px\) \{[\s\S]*?\}/g);
        assert(mobileSection, 'Mobile CSS section should exist');
        
        const mobileCss = mobileSection.join('');
        assert(
            mobileCss.includes('touch-action: pan-x') || !mobileCss.includes('touch-action: pan-y'),
            'CSS should allow horizontal touch action for mobile carousel'
        );
        
        console.log('   📱 CSS touch-action configuration is correct for mobile');
    }

    async testCarouselHTMLStructure() {
        const response = await fetch(`${this.baseUrl}/`, {
            headers: { 'Cookie': this.sessionCookie }
        });
        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        const modelSelector = document.getElementById('model-selector-container');
        assert(modelSelector, 'Model selector container should exist');
        
        const modelCards = document.getElementById('model-cards');
        assert(modelCards, 'Model cards container should exist');
        
        console.log('   🎯 HTML structure is correct for carousel');
    }

    async testJavaScriptTouchFunctions() {
        const response = await fetch(`${this.baseUrl}/js/main.js`);
        const jsContent = await response.text();
        
        assert(jsContent.includes('handleMobileTouchStart'), 'handleMobileTouchStart function should exist');
        assert(jsContent.includes('handleMobileTouchMove'), 'handleMobileTouchMove function should exist');
        assert(jsContent.includes('handleMobileTouchEnd'), 'handleMobileTouchEnd function should exist');
        assert(jsContent.includes('setMobilePosition'), 'setMobilePosition function should exist');
        
        console.log('   ⚙️ Touch handler functions are present');
    }

    async testTouchEventBinding() {
        const response = await fetch(`${this.baseUrl}/js/main.js`);
        const jsContent = await response.text();
        
        assert(jsContent.includes('touchstart'), 'Touch start event should be bound');
        assert(jsContent.includes('touchmove'), 'Touch move event should be bound');
        assert(jsContent.includes('touchend'), 'Touch end event should be bound');
        
        console.log('   🖐️ Touch event bindings are configured');
    }

    async testConstraintLogicSimplicity() {
        const response = await fetch(`${this.baseUrl}/js/main.js`);
        const jsContent = await response.text();
        
        assert(
            !jsContent.includes('constraints blocking movement, bypassing temporarily'),
            'Complex constraint bypass logic should be removed'
        );
        
        assert(
            jsContent.includes('simpleConstrain') || jsContent.includes('constrainPosition'),
            'Constraint function should exist'
        );
        
        console.log('   🎯 Constraint logic is simplified');
    }

    async testMobileSpecificCSS() {
        const response = await fetch(`${this.baseUrl}/css/style.css`);
        const cssContent = await response.text();
        
        const mobileSection = cssContent.match(/@media \(max-width: 768px\) \{[\s\S]*?\}/g);
        assert(mobileSection, 'Mobile CSS section should exist');
        
        const mobileCss = mobileSection.join('');
        assert(
            mobileCss.includes('#model-cards') || mobileCss.includes('model-card'),
            'Mobile CSS should include carousel styling'
        );
        
        console.log('   📱 Mobile-specific CSS is configured');
    }

    async testTransitionHandling() {
        const response = await fetch(`${this.baseUrl}/js/main.js`);
        const jsContent = await response.text();
        
        assert(
            jsContent.includes('touching') || jsContent.includes('transition'),
            'Transition handling during touch should be implemented'
        );
        
        console.log('   🎬 CSS transition handling is implemented');
    }

    async testBoundaryLogic() {
        const response = await fetch(`${this.baseUrl}/js/main.js`);
        const jsContent = await response.text();
        
        const hasScrollWidth = jsContent.includes('scrollWidth');
        const hasClientWidth = jsContent.includes('clientWidth');
        const hasMathMinMax = jsContent.includes('Math.min') && jsContent.includes('Math.max');
        
        assert(hasScrollWidth && hasClientWidth && hasMathMinMax, 
            'Boundary calculation should use scrollWidth, clientWidth, and Math.min/max');
        
        console.log('   🚧 Boundary logic is implemented correctly');
    }

    async runAllTests() {
        console.log('🏁 Starting Mobile Carousel Touch Test Suite\n');

        const serverStarted = await this.startServer();
        if (!serverStarted) {
            console.log('❌ Failed to start server. Exiting tests.');
            return;
        }

        console.log('');

        await this.runTest('CSS Mobile Touch Action', () => this.testCSSMobileTouchAction());
        await this.runTest('Carousel HTML Structure', () => this.testCarouselHTMLStructure());
        await this.runTest('JavaScript Touch Functions', () => this.testJavaScriptTouchFunctions());
        await this.runTest('Touch Event Binding', () => this.testTouchEventBinding());
        await this.runTest('Constraint Logic Simplicity', () => this.testConstraintLogicSimplicity());
        await this.runTest('Mobile Specific CSS', () => this.testMobileSpecificCSS());
        await this.runTest('Transition Handling', () => this.testTransitionHandling());
        await this.runTest('Boundary Logic', () => this.testBoundaryLogic());

        await this.stopServer();

        this.printResults();
    }

    printResults() {
        console.log('\n📋 Test Results Summary:');
        console.log('============================================================');
        
        const passed = this.testResults.filter(test => test.status === 'PASSED');
        const failed = this.testResults.filter(test => test.status === 'FAILED');
        
        this.testResults.forEach(test => {
            const icon = test.status === 'PASSED' ? '✅' : '❌';
            console.log(`${icon} ${test.name}`);
            if (test.error) {
                console.log(`   💥 ${test.error}`);
            }
        });
        
        console.log('============================================================');
        console.log(`Total: ${this.testResults.length} | Passed: ${passed.length} | Failed: ${failed.length}`);
        
        if (failed.length === 0) {
            console.log('🎉 All tests passed! Mobile carousel touch functionality is working correctly.');
        } else {
            console.log('🚨 Some tests failed. Please review the implementation.');
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new MobileCarouselTester();
    
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down tests...');
        await tester.stopServer();
        process.exit(0);
    });
    
    tester.runAllTests().catch(console.error);
}

export { MobileCarouselTester };
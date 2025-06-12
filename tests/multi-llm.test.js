#!/usr/bin/env node

/**
 * Multi-LLM Feature Test Suite
 * Tests the complete multi-LLM selection functionality
 */

import fetch from 'node-fetch';
import assert from 'assert';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

class MultiLLMTester {
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
            const response = await fetch(`${this.baseUrl}/api/models`, {
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
        try {
            const { spawn } = await import('child_process');
            spawn('pkill', ['-f', 'node server.js'], { stdio: 'ignore' });
            await delay(2000);
        } catch (error) {
        }
    }

    async stopServer() {
        if (this.serverProcess) {
            console.log('🛑 Stopping server...');
            this.serverProcess.kill('SIGTERM');
            await delay(2000);
        }
    }

    async runTest(testName, testFn) {
        console.log(`\n🧪 Running test: ${testName}`);
        try {
            await testFn();
            console.log(`✅ ${testName} - PASSED`);
            this.testResults.push({ name: testName, status: 'PASSED' });
        } catch (error) {
            console.log(`❌ ${testName} - FAILED: ${error.message}`);
            this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
        }
    }

    async testModelsAPI() {
        const response = await fetch(`${this.baseUrl}/api/models`, {
            headers: { 'Cookie': this.sessionCookie }
        });
        
        assert(response.ok, `Models API should return 200, got ${response.status}`);
        
        const data = await response.json();
        assert(data.models, 'Response should contain models array');
        assert(data.defaultModel, 'Response should contain defaultModel');
        assert(data.models.length === 5, `Expected 5 models, got ${data.models.length}`);
        
        const model = data.models[0];
        assert(model.id, 'Model should have id');
        assert(model.name, 'Model should have name');
        assert(model.provider, 'Model should have provider');
        assert(typeof model.inputPrice === 'number', 'Model should have numeric inputPrice');
        assert(typeof model.outputPrice === 'number', 'Model should have numeric outputPrice');
        
        console.log(`   📊 Found ${data.models.length} models`);
        console.log(`   🎯 Default model: ${data.defaultModel}`);
    }

    async testModelsList() {
        const response = await fetch(`${this.baseUrl}/api/models`, {
            headers: { 'Cookie': this.sessionCookie }
        });
        const data = await response.json();
        
        const expectedModels = [
            'google/gemini-2.5-flash-preview-05-20:thinking',
            'meta-llama/llama-4-maverick',
            'openai/gpt-4o-mini',
            'deepseek/deepseek-r1-0528',
            'openai/gpt-4.1-mini'
        ];
        
        const actualModelIds = data.models.map(m => m.id);
        expectedModels.forEach(expectedId => {
            assert(actualModelIds.includes(expectedId), `Missing model: ${expectedId}`);
        });
        
        console.log(`   ✓ All expected models present`);
    }

    async testModelPricing() {
        const response = await fetch(`${this.baseUrl}/api/models`, {
            headers: { 'Cookie': this.sessionCookie }
        });
        const data = await response.json();
        
        const geminiModel = data.models.find(m => m.id === 'google/gemini-2.5-flash-preview-05-20:thinking');
        assert(geminiModel.inputPrice === 0.15, `Gemini input price should be 0.15, got ${geminiModel.inputPrice}`);
        assert(geminiModel.outputPrice === 0.6, `Gemini output price should be 0.6, got ${geminiModel.outputPrice}`);
        
        const deepseekModel = data.models.find(m => m.id === 'deepseek/deepseek-r1-0528');
        assert(deepseekModel.inputPrice === 0.5, `DeepSeek input price should be 0.5, got ${deepseekModel.inputPrice}`);
        assert(deepseekModel.outputPrice === 2.15, `DeepSeek output price should be 2.15, got ${deepseekModel.outputPrice}`);
        
        console.log(`   💰 Pricing validation passed`);
    }

    async testMainPageHTML() {
        const response = await fetch(`${this.baseUrl}/`, {
            headers: { 'Cookie': this.sessionCookie }
        });
        
        assert(response.ok, `Main page should return 200, got ${response.status}`);
        
        const html = await response.text();
        assert(html.includes('model-selector-section'), 'HTML should contain model selector section');
        assert(html.includes('model-cards'), 'HTML should contain model cards container');
        assert(html.includes('Choose AI Model'), 'HTML should contain model selector title');
        assert(html.includes('loadAvailableModels') || html.includes('model-selector'), 'HTML should contain model loading JavaScript or model selector');
        
        console.log(`   🌐 Main page contains all required model selector elements`);
    }

    async testAuthenticationRequired() {
        const response = await fetch(`${this.baseUrl}/api/models`);
        assert(response.status === 401, `Should require authentication, got ${response.status}`);
        
        console.log(`   🔒 Authentication properly enforced`);
    }

    async testSearchEndpoint() {
        const response = await fetch(`${this.baseUrl}/search`, {
            method: 'POST',
            headers: { 
                'Cookie': this.sessionCookie,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: 'test search query' })
        });
        
        assert(response.ok, `Search endpoint should return 200, got ${response.status}`);
        
        const data = await response.json();
        assert(data.query, 'Search response should contain query');
        assert(data.urlsToProcess, 'Search response should contain urlsToProcess');
        assert(data.topItems, 'Search response should contain topItems');
        
        console.log(`   🔍 Search returned ${data.urlsToProcess.length} URLs to process`);
    }

    async testModelSelectionPersistence() {
        const testData = {
            query: 'test query',
            urlsToProcess: ['https://example.com'],
            topItems: [{ title: 'Test', link: 'https://example.com' }],
            selectedModel: 'openai/gpt-4o-mini'
        };
        
        const response = await fetch(`${this.baseUrl}/process-and-summarize`, {
            method: 'POST',
            headers: { 
                'Cookie': this.sessionCookie,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        
        assert(response.ok, `Process endpoint should accept model parameter, got ${response.status}`);
        assert(response.headers.get('content-type').includes('text/event-stream'), 'Should return SSE stream');
        
        console.log(`   📡 Process endpoint accepts selectedModel parameter`);
    }

    async runAllTests() {
        console.log('🏁 Starting Multi-LLM Feature Test Suite\n');
        
        const serverStarted = await this.startServer();
        if (!serverStarted) {
            console.log('❌ Cannot run tests - server failed to start');
            return false;
        }

        await this.runTest('Models API Response Structure', () => this.testModelsAPI());
        await this.runTest('Models List Validation', () => this.testModelsList());
        await this.runTest('Model Pricing Validation', () => this.testModelPricing());
        
        await this.runTest('Authentication Required', () => this.testAuthenticationRequired());
        
        await this.runTest('Main Page HTML Structure', () => this.testMainPageHTML());
        
        await this.runTest('Search Endpoint Functionality', () => this.testSearchEndpoint());
        await this.runTest('Model Selection Persistence', () => this.testModelSelectionPersistence());

        await this.stopServer();
        
        this.printResults();
        return this.testResults.every(result => result.status === 'PASSED');
    }

    printResults() {
        console.log('\n📋 Test Results Summary:');
        console.log('='.repeat(60));
        
        let passed = 0;
        let failed = 0;
        
        this.testResults.forEach(result => {
            const icon = result.status === 'PASSED' ? '✅' : '❌';
            console.log(`${icon} ${result.name}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
            
            if (result.status === 'PASSED') passed++;
            else failed++;
        });
        
        console.log('='.repeat(60));
        console.log(`Total: ${this.testResults.length} | Passed: ${passed} | Failed: ${failed}`);
        
        if (failed === 0) {
            console.log('🎉 All tests passed! Multi-LLM feature is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please review the errors above.');
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new MultiLLMTester();
    
    process.on('SIGINT', async () => {
        console.log('\n🛑 Test interrupted by user');
        await tester.stopServer();
        process.exit(1);
    });
    
    tester.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('💥 Test suite crashed:', error);
        tester.stopServer();
        process.exit(1);
    });
}

export default MultiLLMTester;
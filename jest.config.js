module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/.homeybuild/'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: 'tsconfig.json'
        }]
    },
    moduleNameMapper: {
        '^homey$': '<rootDir>/__mocks__/homey.ts'
    },
    collectCoverageFrom: [
        'lib/**/*.ts',
        'drivers/**/*.ts',
        'app.ts',
        'api.ts',
        '!**/__tests__/**',
        '!**/__mocks__/**',
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/',
        '/__mocks__/',
        '/.homeybuild/',
    ],
    coverageThreshold: {
        global: {
            branches: 85,
            functions: 90,
            lines: 95,
            statements: 95,
        },
    },
    coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
}; 
pipeline {
    agent any

    tools {
        nodejs 'NodeJS' // Make sure you have a NodeJS tool configured in Jenkins under "Manage Jenkins" -> "Global Tool Configuration"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }
        stage('Run Tests') {
            steps {
                sh 'npm test'
            }
        }
        stage('Build') {
            steps {
                sh 'npm run build' // Adjust this to your build script
            }
        }
    }

    post {
        success {
            // Report success to GitHub
            step([$class: 'GitHubCommitStatusSetter', statusResult: 'SUCCESS'])
        }
        failure {
            // Report failure to GitHub
            step([$class: 'GitHubCommitStatusSetter', statusResult: 'FAILURE'])
        }
    }
}
#!/bin/bash
# local-dev.sh - Local development setup script

# ===========================================
# Local Docker Development Script
# This won't affect your production setup!
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo "🚀 Setting up LOCAL Docker development environment..."
echo "📁 This setup is separate from your production deployment"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Docker is running"

# Create local environment files if they don't exist
create_env_files() {
    if [ ! -f ".env" ]; then
        print_error ".env file not found! Please create it with your API keys."
        exit 1
    else
        print_status ".env file found - using existing environment variables"
    fi
}

# Function to start services
start_services() {
    print_info "🧹 Cleaning up any existing local containers..."
    docker compose -f docker-compose.local.yml down -v 2>/dev/null || true

    print_info "🔨 Building local Docker images..."
    docker compose -f docker-compose.local.yml build

    print_info "🚀 Starting local services..."
    docker compose -f docker-compose.local.yml up -d

    print_info "⏳ Waiting for services to start..."
    sleep 45

    # Check service health
    check_services
}

# Function to check service health
check_services() {
    print_info "🔍 Checking service health..."
    
    services=("qdrant-local" "mcp-local" "backend-local" "frontend-local")
    for service in "${services[@]}"; do
        if docker compose -f docker-compose.local.yml ps | grep -q "$service.*Up"; then
            print_status "$service is running"
        else
            print_error "$service failed to start"
            print_info "Check logs with: docker compose -f docker-compose.local.yml logs $service"
        fi
    done

    # Test connectivity
    print_info "🔗 Testing connectivity..."
    
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        print_status "Frontend accessible at http://localhost:3000"
    else
        print_warning "Frontend may still be starting up..."
    fi

    if curl -s http://localhost:8000 > /dev/null 2>&1; then
        print_status "Backend accessible at http://localhost:8000"
    else
        print_warning "Backend may still be starting up..."
    fi

    if curl -s http://localhost:6333/healthz > /dev/null 2>&1; then
        print_status "Qdrant accessible at http://localhost:6333"
    else
        print_warning "Qdrant may still be starting up..."
    fi
}

# Function to show logs
show_logs() {
    echo ""
    print_info "📝 Recent logs from all services:"
    docker compose -f docker-compose.local.yml logs --tail=20
}

# Function to show helpful commands
show_commands() {
    echo ""
    echo "🎉 Local development environment is ready!"
    echo ""
    print_info "🌐 Access your app at: http://localhost:3000"
    echo ""
    print_info "🔧 Useful commands for LOCAL development:"
    echo "  Start services:     ./local-dev.sh start"
    echo "  Stop services:      ./local-dev.sh stop"
    echo "  View logs:          ./local-dev.sh logs"
    echo "  Restart services:   ./local-dev.sh restart"
    echo "  Clean everything:   ./local-dev.sh clean"
    echo ""
    print_info "📋 Or use docker compose directly:"
    echo "  docker compose -f docker-compose.local.yml up"
    echo "  docker compose -f docker-compose.local.yml logs -f"
    echo "  docker compose -f docker-compose.local.yml down"
    echo ""
    print_warning "Note: This setup is completely separate from your production deployment!"
}

# Handle command line arguments
case "${1:-start}" in
    "start")
        create_env_files
        start_services
        show_commands
        ;;
    "stop")
        print_info "🛑 Stopping local services..."
        docker compose -f docker-compose.local.yml down
        print_status "Local services stopped"
        ;;
    "restart")
        print_info "🔄 Restarting local services..."
        docker compose -f docker-compose.local.yml down
        sleep 5
        docker compose -f docker-compose.local.yml up -d
        sleep 30
        check_services
        ;;
    "logs")
        show_logs
        ;;
    "clean")
        print_info "🧹 Cleaning up all local Docker resources..."
        docker compose -f docker-compose.local.yml down -v
        docker system prune -f
        print_status "Cleanup complete"
        ;;
    "status")
        print_info "📊 Service status:"
        docker compose -f docker-compose.local.yml ps
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|clean|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start local development environment (default)"
        echo "  stop    - Stop all local services"
        echo "  restart - Restart all local services"
        echo "  logs    - Show recent logs from all services"
        echo "  clean   - Clean up all local Docker resources"
        echo "  status  - Show current service status"
        ;;
esac
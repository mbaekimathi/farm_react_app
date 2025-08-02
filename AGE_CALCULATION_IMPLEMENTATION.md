# Age Calculation Implementation for Kwetu Farm App

## Overview
This document outlines the implementation of age calculation functionality for registered animals in the Kwetu Farm App. The system now calculates and displays the age in days of all registered animals from their birth dates.

## What Was Implemented

### 1. Backend API Endpoints

#### New Endpoints Added:
- `GET /api/pigs/grown-pigs` - Returns all grown pigs with age calculations
- `GET /api/pigs/litters` - Returns all litters with age calculations  
- `GET /api/pigs/batches` - Returns all batches with age calculations
- `GET /api/pigs/animals/age-range` - Filter animals by age range
- `GET /api/pigs/statistics/age` - Get comprehensive age statistics

#### Updated Endpoints:
- `GET /api/pigs/recent/:type` - Now includes age data for recent registrations
- `GET /api/pigs/available-piglets` - Now includes age data for piglets
- `GET /api/breeding/grown-pigs` - Now includes age data for breeding pigs

### 2. Age Calculation Features

#### SQL Queries:
- `DATEDIFF(CURDATE(), birth_date) as age_in_days` - Calculates days since birth
- `FLOOR(DATEDIFF(CURDATE(), birth_date) / 7) as age_in_weeks` - Calculates weeks
- `FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) as age_in_months` - Calculates months

#### Helper Functions:
- `formatAge(days)` - Formats age into human-readable format (e.g., "2 weeks 3 days")
- `getAgeCategory(days)` - Categorizes animals by age (newborn, young, adolescent, adult, mature)

### 3. Frontend Components

#### Updated Components:
- **PigRegistration.js** - Now displays age information in:
  - Item cards (grid and list views)
  - Detail modals for grown pigs and litters
  - Age is shown in blue text for easy identification

- **PigStages.js** - Completely rewritten to:
  - Fetch real data from backend instead of static data
  - Calculate growth stages based on actual age
  - Show real-time age calculations
  - Display estimated time to next stage

#### New Components:
- **PigAgeAnalytics.js** - New comprehensive analytics component featuring:
  - Age statistics overview for all animal types
  - Age distribution charts
  - Age range filtering
  - Detailed age-based reporting

### 4. Age Categories

The system categorizes animals into age groups:
- **Newborn**: 0-30 days
- **Young**: 31-90 days  
- **Adolescent**: 91-180 days
- **Adult**: 181-365 days
- **Mature**: 1+ years

### 5. Growth Stages

Pigs are automatically categorized into growth stages based on age:
- **Piglet**: 0-8 weeks (0-56 days)
- **Weaner**: 8-12 weeks (57-84 days)
- **Grower**: 12-20 weeks (85-140 days)
- **Finisher**: 20-24 weeks (141-168 days)
- **Market Ready**: 24+ weeks (169+ days)

## API Response Format

### Example Response with Age Data:
```json
{
  "id": 1,
  "pig_id": "P001",
  "gender": "male",
  "breed": "Large White",
  "birth_date": "2024-01-15",
  "weight": 85.5,
  "location": "farm_a",
  "health_status": "healthy",
  "age_in_days": 45,
  "age_in_weeks": 6,
  "age_in_months": 1,
  "age_formatted": "6 weeks 3 days",
  "age_category": "young"
}
```

## Usage Examples

### 1. View Age in Registration Module
- Navigate to Pig Registration
- Age is displayed in item cards and detail modals
- Age updates automatically based on current date

### 2. Track Growth Stages
- Navigate to Pig Stages
- View real-time growth stage calculations
- See estimated time to next stage

### 3. Age Analytics
- Navigate to Age Analytics (new module)
- View comprehensive age statistics
- Filter animals by age ranges
- Analyze age distribution across the farm

### 4. Age-Based Filtering
- Use the age range filter to find animals in specific age groups
- Filter by animal type (grown pigs, litters, batches)
- View detailed results with age information

## Technical Implementation Details

### Database Queries:
```sql
-- Age calculation in days
DATEDIFF(CURDATE(), birth_date) as age_in_days

-- Age calculation in weeks  
FLOOR(DATEDIFF(CURDATE(), birth_date) / 7) as age_in_weeks

-- Age calculation in months
FLOOR(DATEDIFF(CURDATE(), birth_date) / 30) as age_in_months
```

### JavaScript Age Formatting:
```javascript
function formatAge(days) {
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''}`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return `${weeks} week${weeks !== 1 ? 's' : ''} ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
  }
  // ... continues for months and years
}
```

## Benefits

1. **Real-time Age Tracking**: All animals now have accurate, up-to-date age information
2. **Growth Stage Management**: Automatic categorization into appropriate growth stages
3. **Data-Driven Decisions**: Age analytics help with breeding, feeding, and health management
4. **Improved User Experience**: Age information is prominently displayed throughout the interface
5. **Comprehensive Reporting**: New analytics module provides detailed age-based insights

## Future Enhancements

1. **Age-based Alerts**: Notifications for animals reaching specific age milestones
2. **Age-based Feeding Schedules**: Automatic feeding recommendations based on age
3. **Breeding Age Validation**: Ensure animals meet minimum age requirements for breeding
4. **Age-based Health Protocols**: Automatic health check scheduling based on age
5. **Export Age Reports**: Generate PDF/Excel reports with age analytics

## Testing

The implementation has been tested with:
- ✅ Backend API endpoints returning correct age calculations
- ✅ Frontend displaying age information correctly
- ✅ Age formatting working for various age ranges
- ✅ Growth stage calculations accurate
- ✅ Age analytics module functioning properly

## Conclusion

The age calculation system is now fully implemented and provides comprehensive age tracking for all registered animals. The system automatically calculates ages from birth dates and provides this information throughout the application, enabling better farm management and data-driven decision making. 
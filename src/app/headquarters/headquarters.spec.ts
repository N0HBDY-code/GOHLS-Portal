import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Headquarters } from './headquarters';

describe('Headquarters', () => {
  let component: Headquarters;
  let fixture: ComponentFixture<Headquarters>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Headquarters]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Headquarters);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
